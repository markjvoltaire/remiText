import type { Space, Message } from 'spectrum-ts';
import { attachment } from 'spectrum-ts';
import { claimMessage, getUserByPhone, getConversationHistory, appendMessage } from '../services/supabase.js';
import { markRead, sendPhotoStack } from '../services/imessage.js';
import { runAgentLoop, isAnthropicCapacityError } from '../ai/claude.js';
import { getOnboardingSession, startOnboarding, advanceOnboarding } from '../services/onboarding.js';
import { buildSignupUrl } from '../utils/signupUrl.js';
import { normalizeContactKey } from '../utils/contactId.js';
import { stripMarkdown } from '../utils/stripMarkdown.js';
import type { FlightCardImage } from '../images/satori/index.js';

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(extractText).join('');
  if (content && typeof content === 'object' && 'text' in content) {
    return String((content as { text: unknown }).text ?? '');
  }
  return '';
}

function buildPostOnboardingHandoff(phone: string): string {
  return `All set! Add your card securely at ${buildSignupUrl(phone)} — I need it on file before I can charge for a booking. Where would you like to fly?`;
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

  const user = await getUserByPhone(contactKey);

  if (!user) {
    const existing =
      (await getOnboardingSession(contactKey)) ??
      (contactKey !== senderId.trim() ? await getOnboardingSession(senderId.trim()) : null);
    if (!existing) {
      await startOnboarding(contactKey);
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

  let agentResult: Awaited<ReturnType<typeof runAgentLoop>>;
  try {
    agentResult = await runAgentLoop(text, history, user);
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    console.error(`[agent] runAgentLoop failed user=${user.id}:`, messageText);
    if (isAnthropicCapacityError(err)) {
      const sorry =
        "Claude's API is temporarily overloaded. Please send your message again in a few seconds — I'll reply as soon as it's available.";
      await appendMessage(user.id, 'assistant', sorry);
      await message.reply(sorry);
      return;
    }
    throw err;
  }

  const reply = stripMarkdown(agentResult.text);

  console.log(
    `[agent] user=${user.id} reply_len=${reply.length} attachments=${agentResult.attachments.length}`,
  );

  await appendMessage(user.id, 'assistant', reply);
  await sendReplyWithAttachments(space, message, reply, agentResult.attachments);
}

function isIMessage(platform: unknown): boolean {
  return typeof platform === 'string' && platform.toLowerCase() === 'imessage';
}

async function sendReplyWithAttachments(
  space: Space,
  message: Message,
  text: string,
  images: FlightCardImage[],
): Promise<void> {
  if (images.length === 0) {
    await message.reply(text);
    return;
  }

  if (images.length >= 2 && isIMessage((message as { platform?: unknown }).platform)) {
    try {
      const guid = await sendPhotoStack(
        space.id,
        images.map((img, i) => ({
          buffer: img.buffer,
          fileName: `flight-card-${i + 1}.png`,
        })),
        { text },
      );
      console.log(`[reply] photo-stack sent space=${space.id} parts=${images.length} guid=${guid}`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[reply] photo-stack failed, falling back to separate bubbles: ${msg}`);
    }
  }

  const builders = images.map((img, i) =>
    attachment(img.buffer, {
      mimeType: img.contentType,
      name: images.length === 1 ? 'flight-card.png' : `flight-card-${i + 1}.png`,
    }),
  );

  const [first, second, ...rest] = builders;
  if (!first) {
    await message.reply(text);
    return;
  }

  try {
    if (!second) {
      await message.reply(first, text);
      return;
    }
    await message.reply(first, second, ...rest, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[reply] attachment send failed, falling back to text-only: ${msg}`);
    await message.reply(text);
  }
}
