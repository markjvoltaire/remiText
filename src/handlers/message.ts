import type { Space, Message } from 'spectrum-ts';
import { attachment } from 'spectrum-ts';
import {
  claimMessage,
  getUserByPhone,
  getConversationHistory,
  appendMessage,
  setLastSentPreviewCards,
} from '../services/supabase.js';
import { markRead, sendPhotoStack, resolveInboundReplyTarget, isReplyToOurMessage } from '../services/imessage.js';
import { runAgentLoop, isAnthropicCapacityError } from '../ai/claude.js';
import {
  advanceOnboarding,
  cancelOnboarding,
  getOnboardingSession,
  handleAwaitingLinkMessage,
  isLinkWalletConnected,
  isOnboardingCancelMessage,
  startOnboarding,
} from '../services/onboarding.js';
import { normalizeContactKey } from '../utils/contactId.js';
import { stripMarkdown } from '../utils/stripMarkdown.js';
import {
  augmentBookRestaurantCommand,
  augmentLinkConnectApproval,
  augmentRestaurantBookingYes,
  augmentUserMessageWithReplyContext,
  augmentUserMessageWithSelection,
  inferPreviewKind,
} from '../utils/replyContext.js';
import type { PreviewCardImage, PreviewCardRef } from '../images/satori/index.js';
import type { LastSentPreviewCards } from '../types.js';
import { sessionAssistantLog, sessionTurnAbort, sessionTurnStart } from '../utils/sessionLog.js';

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(extractText).join('');
  if (content && typeof content === 'object' && 'text' in content) {
    return String((content as { text: unknown }).text ?? '');
  }
  return '';
}

function welcomeMessage(name: string): string {
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    `you're all set, ${first}.\n\n` +
    `text me when you want a table, a flight, or what's good near you.`
  );
}

export async function handleMessage(space: Space, message: Message): Promise<void> {
  const id = (message as any).id;
  if (!id || !(await claimMessage(id))) return;

  await markRead(space.id).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[markRead] failed space=${space.id}: ${msg}`);
  });

  const senderId = (message as any).direction === 'inbound' ? (message.sender?.id ?? space.id) : space.id;
  const contactKey = normalizeContactKey(senderId);
  const text = extractText(message.content);

  console.log(
    `[msg] id=${id} space=${space.id} sender=${contactKey} inbound_len=${text.length}`,
  );

  const userRecord = await getUserByPhone(contactKey);

  if (!userRecord) {
    let session = await getOnboardingSession(contactKey);
    if (session && isOnboardingCancelMessage(text)) {
      await cancelOnboarding(session.phone);
      await space.send("no worries — text me anytime when you want to pick this back up.");
      return;
    }

    if (!session) {
      await startOnboarding(contactKey);
      await space.send("hey — i'm remi.\n\nwhat's your first name?");
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
    } else if (linkResult.kind === 'reply') {
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
  if (
    !hadAssistantReply &&
    /^(done|finished|all set|ready|i'm done|im done)\b/i.test(text.trim())
  ) {
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

  let agentInput = text;

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
      const kind =
        (strictMatch ? previewCards!.kind : null) ??
        inferPreviewKind(user, partIndex);

      if (kind) {
        const augmented = strictMatch
          ? augmentUserMessageWithReplyContext(text, user, previewCards!, partIndex)
          : augmentUserMessageWithSelection(text, user, kind, partIndex);

        if (augmented !== text) {
          console.log(
            `[msg] reply-to-preview kind=${kind} part=${partIndex} target=${replyTarget.guid} strict=${Boolean(strictMatch)}`,
          );
          agentInput = augmented;
        }
      } else {
        console.log(
          `[msg] reply target resolved but no preview context part=${partIndex} target=${replyTarget.guid}`,
        );
      }
    } else {
      console.log(`[msg] reply target is not our message guid=${replyTarget.guid}`);
    }
  }

  sessionTurnStart({
    userId: user.id,
    messageId: id,
    contactKey,
    inboundText: text,
    agentInput: agentInput !== text ? agentInput : undefined,
    historyCount: history.length,
  });

  await appendMessage(user.id, 'user', agentInput);

  let agentResult: Awaited<ReturnType<typeof runAgentLoop>>;
  try {
    agentResult = await runAgentLoop(agentInput, history, user);
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    console.error(`[agent] runAgentLoop failed user=${user.id}:`, messageText);
    if (isAnthropicCapacityError(err)) {
      const sorry =
        "Claude's API is temporarily overloaded. Please send your message again in a few seconds — I'll reply as soon as it's available.";
      sessionAssistantLog(sorry);
      await appendMessage(user.id, 'assistant', sorry);
      await space.send(sorry);
      return;
    }
    sessionTurnAbort(messageText);
    throw err;
  }

  const reply = stripMarkdown(agentResult.text);

  console.log(
    `[agent] user=${user.id} reply_len=${reply.length} attachments=${agentResult.attachments.length}`,
  );

  sessionAssistantLog(reply, { attachments: agentResult.attachments.length });
  await appendMessage(user.id, 'assistant', reply);
  const sendMeta = await sendReplyWithAttachments(space, message, reply, agentResult.attachments);
  await persistSentPreviewCards(user.id, agentResult.attachments, sendMeta);
}

function previewCardsFromAttachments(
  attachments: PreviewCardImage[],
): { kind: LastSentPreviewCards['kind']; optionCount: number } | null {
  const refs = attachments.map((img) => img.ref).filter((ref): ref is PreviewCardRef => Boolean(ref));
  if (refs.length === 0) return null;
  return { kind: refs[0]!.kind, optionCount: refs.length };
}

async function persistSentPreviewCards(
  userId: string,
  attachments: PreviewCardImage[],
  sendMeta: SentPreviewMeta,
): Promise<void> {
  const preview = previewCardsFromAttachments(attachments);
  if (!preview || !sendMeta.parentMessageId) return;

  await setLastSentPreviewCards(userId, {
    parentMessageId: sendMeta.parentMessageId,
    kind: preview.kind,
    optionCount: preview.optionCount,
    updated_at: new Date().toISOString(),
  });
  console.log(
    `[preview] stored parent=${sendMeta.parentMessageId} kind=${preview.kind} count=${preview.optionCount}`,
  );
}

function isIMessage(platform: unknown): boolean {
  return typeof platform === 'string' && platform.toLowerCase() === 'imessage';
}

interface SentPreviewMeta {
  parentMessageId?: string;
}

async function sendReplyWithAttachments(
  space: Space,
  message: Message,
  text: string,
  images: PreviewCardImage[],
): Promise<SentPreviewMeta> {
  if (images.length === 0) {
    await space.send(text);
    return {};
  }

  if (images.length >= 2 && isIMessage((message as { platform?: unknown }).platform)) {
    try {
      const guid = await sendPhotoStack(
        space.id,
        images.map((img, i) => ({
          buffer: img.buffer,
          fileName: `preview-card-${i + 1}.png`,
        })),
        { text },
      );
      console.log(`[reply] photo-stack sent space=${space.id} parts=${images.length} guid=${guid}`);
      return { parentMessageId: guid };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[reply] photo-stack failed, falling back to separate bubbles: ${msg}`);
    }
  }

  const builders = images.map((img, i) =>
    attachment(img.buffer, {
      mimeType: img.contentType,
      name: images.length === 1 ? 'preview-card.png' : `preview-card-${i + 1}.png`,
    }),
  );

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[reply] attachment send failed, falling back to text-only: ${msg}`);
    await space.send(text);
    return {};
  }
}
