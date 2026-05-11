import { claimMessage, getUserByPhone, getConversationHistory, appendMessage } from '../services/supabase.js';
import { markRead } from '../services/imessage.js';
import { runAgentLoop } from '../ai/claude.js';
import { getOnboardingSession, startOnboarding, advanceOnboarding } from '../services/onboarding.js';
import { buildSignupUrl } from '../utils/signupUrl.js';
function extractText(content) {
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content))
        return content.map(extractText).join('');
    if (content && typeof content === 'object' && 'text' in content) {
        return String(content.text ?? '');
    }
    return '';
}
function buildPostOnboardingHandoff(phone) {
    return `All set! Add your card securely at ${buildSignupUrl(phone)} — I need it on file before I can charge for a booking. Where would you like to fly?`;
}
function sanitizeOutgoingText(text) {
    return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\*/g, '');
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
    const text = extractText(message.content);
    console.log(`[msg] space=${space.id} sender=${senderId} text="${text}"`);
    const user = await getUserByPhone(senderId);
    if (!user) {
        const existing = await getOnboardingSession(senderId);
        if (!existing) {
            await startOnboarding(senderId);
            await message.reply("Hi! I'm Remi. Let's get you set up. What's your full name?");
            return;
        }
        const result = await advanceOnboarding(existing, text);
        if (result.kind === 'prompt') {
            await message.reply(result.message);
            return;
        }
        const newUser = result.user;
        const handoff = buildPostOnboardingHandoff(newUser.phone);
        await appendMessage(newUser.id, 'assistant', handoff);
        await message.reply(handoff);
        return;
    }
    console.log(`[msg] user=${user.id}`);
    const history = await getConversationHistory(user.id);
    await appendMessage(user.id, 'user', text);
    const replyRaw = await runAgentLoop(text, history, user);
    const reply = sanitizeOutgoingText(replyRaw);
    console.log(`[agent] user=${user.id} reply=${JSON.stringify(reply)}`);
    await appendMessage(user.id, 'assistant', reply);
    await message.reply(reply);
}
