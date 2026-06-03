import { attachment } from 'spectrum-ts';
import { claimMessage, getUserByPhone, getConversationHistory, appendMessage, setLastSentPreviewCards, } from '../services/supabase.js';
import { markRead, sendPhotoStack, resolveInboundReplyTarget, isReplyToOurMessage } from '../services/imessage.js';
import { runAgentLoop, isAnthropicCapacityError } from '../ai/claude.js';
import { advanceOnboarding, cancelOnboarding, getOnboardingSession, handleAwaitingLinkMessage, isLinkWalletConnected, isOnboardingCancelMessage, startOnboarding, } from '../services/onboarding.js';
import { normalizeContactKey } from '../utils/contactId.js';
import { stripMarkdown } from '../utils/stripMarkdown.js';
import { augmentBookRestaurantCommand, augmentLinkConnectApproval, augmentRestaurantBookingYes, augmentUserMessageWithReplyContext, augmentUserMessageWithSelection, inferPreviewKind, } from '../utils/replyContext.js';
import { sessionAssistantLog, sessionTurnAbort, sessionTurnStart } from '../utils/sessionLog.js';
import { extractInboundContent, formatUserTurnForHistory, mergeVoiceTranscript, messageHasUnprocessedMedia, } from '../utils/inboundContent.js';
import { transcribeAudio, TranscriptionNotConfiguredError, } from '../services/transcribe.js';
function welcomeMessage(name) {
    const first = name.trim().split(/\s+/)[0] || name;
    return (`you're all set, ${first}.\n\n` +
        `i'm here whenever — chat, questions, whatever. when you want something handled i can book tables, find flights, and tell you what's good nearby.`);
}
export async function handleMessage(space, message) {
    const id = message.id;
    if (!id || !(await claimMessage(id)))
        return;
    await markRead(space.id).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[markRead] failed space=${space.id}: ${msg}`);
    });
    const senderId = message.direction === 'inbound' ? (message.sender?.id ?? space.id) : space.id;
    const contactKey = normalizeContactKey(senderId);
    const inbound = await extractInboundContent(message);
    const text = inbound.text;
    const inboundImages = inbound.images;
    const inboundVoice = inbound.voice;
    console.log(`[msg] id=${id} space=${space.id} sender=${contactKey} inbound_len=${text.length} images=${inboundImages.length} voice=${inboundVoice.length}`);
    const userRecord = await getUserByPhone(contactKey);
    if (!userRecord) {
        if ((inboundImages.length > 0 || inboundVoice.length > 0) && !text.trim()) {
            await space.send("i can read screenshots and voice memos once you're set up — what's your first name?");
            return;
        }
        let session = await getOnboardingSession(contactKey);
        if (session && isOnboardingCancelMessage(text)) {
            await cancelOnboarding(session.phone);
            await space.send("no worries — text me anytime when you want to pick this back up.");
            return;
        }
        if (!session) {
            await startOnboarding(contactKey);
            await space.send("hey — i'm remi, your assistant in iMessage.\n\nwhat's your first name?");
            return;
        }
        const result = await advanceOnboarding(session, text);
        if (result.kind === 'prompt' || result.kind === 'awaiting_link') {
            await space.send(result.message);
            return;
        }
        await space.send(welcomeMessage(result.user.name));
        return;
    }
    let user = userRecord;
    if (!isLinkWalletConnected(user)) {
        const history = await getConversationHistory(user.id);
        const linkResult = await handleAwaitingLinkMessage(user, text, history);
        if (linkResult.kind === 'completed') {
            user = linkResult.user;
            if (/^(done|finished|all set|ready|approved|connected)\b/i.test(text.trim())) {
                const welcome = welcomeMessage(user.name);
                await appendMessage(user.id, 'user', text);
                sessionAssistantLog(welcome);
                await appendMessage(user.id, 'assistant', welcome);
                await space.send(welcome);
                return;
            }
        }
        else if (linkResult.kind === 'reply') {
            await appendMessage(user.id, 'user', text);
            sessionAssistantLog(linkResult.message);
            await appendMessage(user.id, 'assistant', linkResult.message);
            await space.send(linkResult.message);
            return;
        }
        // kind === 'continue' → run agent below (search, restaurants, etc.)
    }
    const history = await getConversationHistory(user.id);
    const hadAssistantReply = history.some((m) => m.role === 'assistant');
    if (!hadAssistantReply &&
        /^(done|finished|all set|ready|i'm done|im done)\b/i.test(text.trim())) {
        const refreshed = await getUserByPhone(contactKey);
        if (refreshed && isLinkWalletConnected(refreshed)) {
            const welcome = welcomeMessage(refreshed.name);
            sessionAssistantLog(welcome);
            await appendMessage(user.id, 'assistant', welcome);
            await space.send(welcome);
            return;
        }
    }
    console.log(`[msg] user=${user.id}`);
    let voiceTranscript = '';
    if (inboundVoice.length > 0) {
        const clip = inboundVoice[0];
        try {
            voiceTranscript = await transcribeAudio(clip.buffer, clip.mimeType, clip.name);
            console.log(`[msg] voice transcribed user=${user.id} chars=${voiceTranscript.length} source=${clip.source} duration=${clip.durationSeconds ?? '?'}s`);
        }
        catch (err) {
            if (err instanceof TranscriptionNotConfiguredError) {
                await space.send("voice memos aren't set up yet — type it out or send a screenshot for now.");
                return;
            }
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[msg] voice transcription failed user=${user.id}: ${msg}`);
            await space.send("couldn't make out that voice memo — try again or type it out.");
            return;
        }
    }
    if (messageHasUnprocessedMedia(message.content, inbound) &&
        !text.trim() &&
        !voiceTranscript) {
        await space.send("couldn't read that — try sending it again or paste the text.");
        return;
    }
    if (!text.trim() && !voiceTranscript && inboundImages.length === 0) {
        console.log(`[msg] empty inbound ignored user=${user.id}`);
        return;
    }
    let agentInput = mergeVoiceTranscript(text, voiceTranscript);
    const baseAgentInput = agentInput;
    const bookAugmented = augmentBookRestaurantCommand(text, user, history);
    if (bookAugmented !== text) {
        console.log('[msg] book-restaurant intent augmented');
        agentInput = bookAugmented;
    }
    const confirmAugmented = augmentRestaurantBookingYes(agentInput, user);
    if (confirmAugmented !== agentInput) {
        console.log('[msg] restaurant booking confirmation augmented');
        agentInput = confirmAugmented;
    }
    const linkAugmented = augmentLinkConnectApproval(agentInput, user);
    if (linkAugmented !== agentInput) {
        console.log('[msg] link connect approval augmented');
        agentInput = linkAugmented;
    }
    const replyTarget = await resolveInboundReplyTarget(space.id, id, text, message);
    if (replyTarget) {
        const partIndex = replyTarget.partIndex ?? 0;
        const previewCards = user.last_sent_preview_cards;
        const strictMatch = previewCards && replyTarget.guid === previewCards.parentMessageId;
        const replyToUs = strictMatch || (await isReplyToOurMessage(space.id, replyTarget));
        if (replyToUs) {
            const kind = (strictMatch ? previewCards.kind : null) ??
                inferPreviewKind(user, partIndex);
            if (kind) {
                const augmented = strictMatch
                    ? augmentUserMessageWithReplyContext(text, user, previewCards, partIndex)
                    : augmentUserMessageWithSelection(text, user, kind, partIndex);
                if (augmented !== text) {
                    console.log(`[msg] reply-to-preview kind=${kind} part=${partIndex} target=${replyTarget.guid} strict=${Boolean(strictMatch)}`);
                    agentInput = augmented;
                }
            }
            else {
                console.log(`[msg] reply target resolved but no preview context part=${partIndex} target=${replyTarget.guid}`);
            }
        }
        else {
            console.log(`[msg] reply target is not our message guid=${replyTarget.guid}`);
        }
    }
    sessionTurnStart({
        userId: user.id,
        messageId: id,
        contactKey,
        inboundText: text,
        agentInput: agentInput !== baseAgentInput ? agentInput : undefined,
        historyCount: history.length,
        imageCount: inboundImages.length,
        voiceMemo: inboundVoice.length > 0,
    });
    const historyContent = formatUserTurnForHistory(agentInput, {
        hasImages: inboundImages.length > 0,
        voiceTranscript: voiceTranscript || undefined,
    });
    await appendMessage(user.id, 'user', historyContent);
    let agentResult;
    try {
        agentResult = await runAgentLoop(agentInput, history, user, { images: inboundImages });
    }
    catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        console.error(`[agent] runAgentLoop failed user=${user.id}:`, messageText);
        if (isAnthropicCapacityError(err)) {
            const sorry = "Claude's API is temporarily overloaded. Please send your message again in a few seconds — I'll reply as soon as it's available.";
            sessionAssistantLog(sorry);
            await appendMessage(user.id, 'assistant', sorry);
            await space.send(sorry);
            return;
        }
        sessionTurnAbort(messageText);
        throw err;
    }
    const reply = stripMarkdown(agentResult.text);
    console.log(`[agent] user=${user.id} reply_len=${reply.length} attachments=${agentResult.attachments.length}`);
    sessionAssistantLog(reply, { attachments: agentResult.attachments.length });
    await appendMessage(user.id, 'assistant', reply);
    const sendMeta = await sendReplyWithAttachments(space, message, reply, agentResult.attachments);
    await persistSentPreviewCards(user.id, agentResult.attachments, sendMeta);
}
function previewCardsFromAttachments(attachments) {
    const refs = attachments.map((img) => img.ref).filter((ref) => Boolean(ref));
    if (refs.length === 0)
        return null;
    return { kind: refs[0].kind, optionCount: refs.length };
}
async function persistSentPreviewCards(userId, attachments, sendMeta) {
    const preview = previewCardsFromAttachments(attachments);
    if (!preview || !sendMeta.parentMessageId)
        return;
    await setLastSentPreviewCards(userId, {
        parentMessageId: sendMeta.parentMessageId,
        kind: preview.kind,
        optionCount: preview.optionCount,
        updated_at: new Date().toISOString(),
    });
    console.log(`[preview] stored parent=${sendMeta.parentMessageId} kind=${preview.kind} count=${preview.optionCount}`);
}
function isIMessage(platform) {
    return typeof platform === 'string' && platform.toLowerCase() === 'imessage';
}
async function sendReplyWithAttachments(space, message, text, images) {
    if (images.length === 0) {
        await space.send(text);
        return {};
    }
    if (images.length >= 2 && isIMessage(message.platform)) {
        try {
            const guid = await sendPhotoStack(space.id, images.map((img, i) => ({
                buffer: img.buffer,
                fileName: `preview-card-${i + 1}.png`,
            })), { text });
            console.log(`[reply] photo-stack sent space=${space.id} parts=${images.length} guid=${guid}`);
            return { parentMessageId: guid };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[reply] photo-stack failed, falling back to separate bubbles: ${msg}`);
        }
    }
    const builders = images.map((img, i) => attachment(img.buffer, {
        mimeType: img.contentType,
        name: images.length === 1 ? 'preview-card.png' : `preview-card-${i + 1}.png`,
    }));
    const [first, second, ...rest] = builders;
    if (!first) {
        await space.send(text);
        return {};
    }
    try {
        if (!second) {
            const sent = await space.send(first, text);
            const firstSent = Array.isArray(sent) ? sent[0] : sent;
            return { parentMessageId: firstSent?.id };
        }
        const sent = await space.send(first, second, ...rest, text);
        const firstSent = Array.isArray(sent) ? sent[0] : sent;
        return { parentMessageId: firstSent?.id };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[reply] attachment send failed, falling back to text-only: ${msg}`);
        await space.send(text);
        return {};
    }
}
