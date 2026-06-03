import type { Message } from 'spectrum-ts';

const MAX_IMAGES = Math.max(
  1,
  Math.min(5, Number.parseInt(process.env.REMI_INBOUND_IMAGE_MAX ?? '3', 10) || 3),
);
const MAX_VOICE = Math.max(
  1,
  Math.min(3, Number.parseInt(process.env.REMI_INBOUND_AUDIO_MAX ?? '1', 10) || 1),
);
const MAX_IMAGE_BYTES = Math.max(
  512_000,
  Math.min(
    10 * 1024 * 1024,
    Number.parseInt(process.env.REMI_INBOUND_IMAGE_MAX_BYTES ?? '5242880', 10) || 5_242_880,
  ),
);
const MAX_VOICE_BYTES = Math.max(
  512_000,
  Math.min(
    25 * 1024 * 1024,
    Number.parseInt(process.env.REMI_INBOUND_AUDIO_MAX_BYTES ?? '25165824', 10) || 25_165_824,
  ),
);
/** Prefer stream() for large clips per Spectrum voice/attachment docs. */
const STREAM_THRESHOLD_BYTES = Math.max(
  256_000,
  Number.parseInt(process.env.REMI_INBOUND_VOICE_STREAM_THRESHOLD_BYTES ?? '1048576', 10) ||
    1_048_576,
);

const CLAUDE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface InboundImageForClaude {
  buffer: Buffer;
  mediaType: ClaudeImageMediaType;
  name: string;
}

export interface InboundVoiceClip {
  buffer: Buffer;
  mimeType: string;
  name: string;
  durationSeconds?: number;
  sizeBytes: number;
  source: 'voice' | 'attachment';
}

export interface ExtractInboundContentResult {
  text: string;
  images: InboundImageForClaude[];
  voice: InboundVoiceClip[];
}

export const IMAGE_ONLY_USER_HINT =
  'The user sent a screenshot or photo with no caption. Read it carefully — it may be a message thread, reservation, flight, menu, or something they want help acting on. Summarize what you see and help, or ask one short clarifying question if needed.';

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(extractText).join('');
  if (content && typeof content === 'object' && 'text' in content) {
    return String((content as { text: unknown }).text ?? '');
  }
  return '';
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/');
}

function isAudioMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('audio/');
}

function photonAttachmentsFromCustom(content: unknown): unknown[] {
  if (!content || typeof content !== 'object') return [];
  const record = content as Record<string, unknown>;
  if (record.type !== 'custom' || !record.raw || typeof record.raw !== 'object') return [];
  const raw = record.raw as Record<string, unknown>;
  const messageContent = raw.content;
  if (!messageContent || typeof messageContent !== 'object') return [];
  const attachments = (messageContent as Record<string, unknown>).attachments;
  return Array.isArray(attachments) ? attachments : [];
}

function hasMediaLikeContent(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false;
  const record = content as Record<string, unknown>;
  if (record.type === 'attachment' || record.type === 'voice') return true;
  if (record.type === 'custom') {
    if (photonAttachmentsFromCustom(content).length > 0) return true;
    const raw = (record.raw ?? {}) as Record<string, unknown>;
    if (raw.isAudioMessage === true) return true;
  }
  if (record.type === 'group' && Array.isArray(record.items)) {
    return (record.items as unknown[]).some((item) => {
      if (!item || typeof item !== 'object') return false;
      const itemRecord = item as Record<string, unknown>;
      const itemContent = 'content' in itemRecord ? itemRecord.content : item;
      return hasMediaLikeContent(itemContent);
    });
  }
  return false;
}

async function streamToBuffer(stream: ReadableStream<Uint8Array | ArrayBuffer>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value instanceof Uint8Array && value.length > 0) {
        chunks.push(Buffer.from(value));
      } else if (value instanceof ArrayBuffer) {
        chunks.push(Buffer.from(value));
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

interface ReadableBytes {
  size?: number;
  read?: () => Promise<Buffer | ArrayBuffer | Uint8Array>;
  stream?: () => Promise<ReadableStream<Uint8Array | ArrayBuffer>>;
}

/** Materialize bytes from Spectrum voice or attachment content (read / stream). */
async function materializeSpectrumBytes(readable: ReadableBytes, label: string): Promise<Buffer | null> {
  const size = typeof readable.size === 'number' ? readable.size : undefined;
  const preferStream = size != null && size > STREAM_THRESHOLD_BYTES;
  try {
    if (preferStream && typeof readable.stream === 'function') {
      const stream = await readable.stream();
      return await streamToBuffer(stream);
    }
    if (typeof readable.read === 'function') {
      const raw = await readable.read();
      if (Buffer.isBuffer(raw)) return raw;
      if (raw instanceof Uint8Array) return Buffer.from(raw);
      return Buffer.from(new Uint8Array(raw));
    }
    if (typeof readable.stream === 'function') {
      const stream = await readable.stream();
      return await streamToBuffer(stream);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[inbound] ${label} byte read failed: ${msg}`);
  }
  return null;
}

async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  const convert = (await import('heic-convert')).default;
  const converted = await convert({
    buffer,
    format: 'JPEG',
    quality: 0.92,
  });
  return Buffer.from(converted);
}

async function normalizeImageForClaude(
  buffer: Buffer,
  mimeType: string,
  name: string,
): Promise<InboundImageForClaude | null> {
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    console.warn(
      `[inbound] skip image ${name}: ${buffer.length === 0 ? 'empty' : `too large (${buffer.length} bytes)`}`,
    );
    return null;
  }

  const lower = mimeType.toLowerCase();
  let mediaType: ClaudeImageMediaType | null = null;
  let output = buffer;

  if (CLAUDE_IMAGE_TYPES.has(lower)) {
    mediaType = lower as ClaudeImageMediaType;
  } else if (lower === 'image/heic' || lower === 'image/heif') {
    try {
      output = await convertHeicToJpeg(buffer);
      mediaType = 'image/jpeg';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[inbound] HEIC convert failed for ${name}: ${msg}`);
      return null;
    }
  } else {
    console.warn(`[inbound] unsupported image mime type ${mimeType} for ${name}`);
    return null;
  }

  if (output.length > MAX_IMAGE_BYTES) {
    console.warn(`[inbound] skip image ${name}: converted size ${output.length} exceeds limit`);
    return null;
  }

  return { buffer: output, mediaType, name };
}

function normalizeVoice(
  buffer: Buffer,
  params: {
    mimeType: string;
    name: string;
    durationSeconds?: number;
    sizeBytes?: number;
    source: InboundVoiceClip['source'];
  },
): InboundVoiceClip | null {
  if (buffer.length === 0 || buffer.length > MAX_VOICE_BYTES) {
    console.warn(
      `[inbound] skip voice ${params.name}: ${buffer.length === 0 ? 'empty' : `too large (${buffer.length} bytes)`}`,
    );
    return null;
  }

  const lower = params.mimeType.toLowerCase();
  if (!isAudioMimeType(lower) && lower !== 'application/octet-stream') {
    console.warn(`[inbound] unsupported voice mime type ${params.mimeType} for ${params.name}`);
    return null;
  }

  return {
    buffer,
    mimeType: isAudioMimeType(lower) ? lower : 'audio/mp4',
    name: params.name,
    durationSeconds: params.durationSeconds,
    sizeBytes: params.sizeBytes ?? buffer.length,
    source: params.source,
  };
}

async function collectVoiceFromVoiceContent(content: ReadableBytes & {
  mimeType: string;
  name?: string;
  duration?: number;
}): Promise<InboundVoiceClip | null> {
  const buffer = await materializeSpectrumBytes(content, 'voice');
  if (!buffer) return null;
  return normalizeVoice(buffer, {
    mimeType: content.mimeType,
    name: content.name ?? 'note.m4a',
    durationSeconds:
      typeof content.duration === 'number' && Number.isFinite(content.duration)
        ? content.duration
        : undefined,
    sizeBytes: typeof content.size === 'number' ? content.size : undefined,
    source: 'voice',
  });
}

async function collectVoiceFromAudioAttachment(content: ReadableBytes & {
  mimeType: string;
  name: string;
}): Promise<InboundVoiceClip | null> {
  const buffer = await materializeSpectrumBytes(content, `attachment:${content.name}`);
  if (!buffer) return null;
  return normalizeVoice(buffer, {
    mimeType: content.mimeType,
    name: content.name,
    sizeBytes: typeof content.size === 'number' ? content.size : undefined,
    source: 'attachment',
  });
}

async function collectMediaFromContent(content: unknown): Promise<{
  images: InboundImageForClaude[];
  voice: InboundVoiceClip[];
}> {
  const images: InboundImageForClaude[] = [];
  const voice: InboundVoiceClip[] = [];

  async function walk(node: unknown): Promise<void> {
    if (images.length >= MAX_IMAGES && voice.length >= MAX_VOICE) return;
    if (!node || typeof node !== 'object') return;

    const record = node as Record<string, unknown>;
    const type = record.type;

    switch (type) {
      case 'text':
      case 'contact':
      case 'richlink':
      case 'reaction':
      case 'poll':
      case 'poll_option':
      case 'typing':
      case 'custom':
        return;
      case 'voice': {
        if (voice.length >= MAX_VOICE) return;
        const clip = await collectVoiceFromVoiceContent(node as ReadableBytes & {
          mimeType: string;
          name?: string;
          duration?: number;
        });
        if (clip) voice.push(clip);
        return;
      }
      case 'attachment': {
        const attachment = node as ReadableBytes & { mimeType: string; name: string };
        const mimeType = attachment.mimeType;
        if (isImageMimeType(mimeType) && images.length < MAX_IMAGES) {
          const buffer = await materializeSpectrumBytes(attachment, `attachment:${attachment.name}`);
          if (buffer) {
            const normalized = await normalizeImageForClaude(buffer, mimeType, attachment.name);
            if (normalized) images.push(normalized);
          }
        } else if (isAudioMimeType(mimeType) && voice.length < MAX_VOICE) {
          const clip = await collectVoiceFromAudioAttachment(attachment);
          if (clip) voice.push(clip);
        }
        return;
      }
      case 'group': {
        const group = node as { items: Array<{ content: unknown }> };
        for (const item of group.items) {
          if (images.length >= MAX_IMAGES && voice.length >= MAX_VOICE) break;
          await walk(item.content);
        }
        return;
      }
      case 'reply':
      case 'edit':
      case 'effect': {
        const wrapped = node as { content?: unknown };
        if (wrapped.content) await walk(wrapped.content);
        return;
      }
      default:
        return;
    }
  }

  await walk(content);
  return { images, voice };
}

export async function extractInboundContent(message: Message): Promise<ExtractInboundContentResult> {
  const content = message.content;
  const text = extractText(content);
  const { images, voice } = await collectMediaFromContent(content);
  return { text, images, voice };
}

interface PhotonAttachmentRef {
  guid: string;
  fileName: string;
  mimeType: string;
  totalBytes?: number;
}

interface PhotonMessageMediaSource {
  isAudioMessage?: boolean;
  content?: {
    text?: string;
    attachments?: readonly PhotonAttachmentRef[];
  };
}

/** Download attachments from a Photon message when Spectrum content bytes are unavailable (cloud relay). */
export async function appendMediaFromPhotonMessage(
  inbound: ExtractInboundContentResult,
  photonMessage: PhotonMessageMediaSource,
  download: (guid: string) => Promise<Buffer | null>,
): Promise<ExtractInboundContentResult> {
  const images = [...inbound.images];
  const voice = [...inbound.voice];
  const attachments = photonMessage.content?.attachments ?? [];
  const treatAllAsVoice = photonMessage.isAudioMessage === true;

  for (const att of attachments) {
    if (images.length >= MAX_IMAGES && voice.length >= MAX_VOICE) break;
    if (!att.guid) continue;

    const buffer = await download(att.guid);
    if (!buffer) {
      console.warn(`[inbound] photon attachment download empty guid=${att.guid} name=${att.fileName}`);
      continue;
    }

    const mimeType = att.mimeType || 'application/octet-stream';
    const asVoice = treatAllAsVoice || isAudioMimeType(mimeType);

    if (asVoice && voice.length < MAX_VOICE) {
      const clip = normalizeVoice(buffer, {
        mimeType,
        name: att.fileName || 'voice.m4a',
        sizeBytes: att.totalBytes,
        source: 'attachment',
      });
      if (clip) voice.push(clip);
      continue;
    }

    if (isImageMimeType(mimeType) && images.length < MAX_IMAGES) {
      const normalized = await normalizeImageForClaude(buffer, mimeType, att.fileName || 'image');
      if (normalized) images.push(normalized);
    }
  }

  const photonText = photonMessage.content?.text?.trim() ?? '';
  const text = inbound.text.trim() ? inbound.text : photonText;

  return { text, images, voice };
}

export function shouldTryPhotonMediaFallback(
  inbound: ExtractInboundContentResult,
  content: unknown,
): boolean {
  if (inboundHasReadableMedia(inbound)) return false;
  if (messageHasUnprocessedMedia(content, inbound)) return true;
  if (!inbound.text.trim() && photonAttachmentsFromCustom(content).length > 0) return true;

  if (!inbound.text.trim()) {
    if (content && typeof content === 'object') {
      const record = content as Record<string, unknown>;
      if (record.type === 'custom') {
        const raw = (record.raw ?? {}) as Record<string, unknown>;
        if (raw.isAudioMessage === true) return true;
        if (typeof raw.guid === 'string') return true;
      }
      if (record.type === 'attachment' || record.type === 'voice') return true;
    }
  }

  return false;
}

export function inboundHasReadableMedia(inbound: Pick<ExtractInboundContentResult, 'images' | 'voice'>): boolean {
  return inbound.images.length > 0 || inbound.voice.length > 0;
}

export function messageHasUnprocessedMedia(
  content: unknown,
  inbound: Pick<ExtractInboundContentResult, 'images' | 'voice'>,
): boolean {
  return hasMediaLikeContent(content) && !inboundHasReadableMedia(inbound);
}

export function formatUserTurnForHistory(
  text: string,
  opts: { hasImages?: boolean; voiceTranscript?: string },
): string {
  const trimmed = text.trim();
  const voiceLine = opts.voiceTranscript?.trim();
  let result = trimmed;

  if (voiceLine) {
    result = result ? `${result}\n\n[voice memo] ${voiceLine}` : `[voice memo] ${voiceLine}`;
  }

  if (opts.hasImages) {
    if (!result) result = '[screenshot]';
    else if (!result.startsWith('[screenshot]')) result = `[screenshot] ${result}`;
  }

  return result || text;
}

export function mergeVoiceTranscript(text: string, transcript: string): string {
  const trimmedText = text.trim();
  const trimmedVoice = transcript.trim();
  if (!trimmedVoice) return trimmedText;
  if (!trimmedText) return trimmedVoice;
  return `${trimmedText}\n\n${trimmedVoice}`;
}

/** Placeholder for user turns stored with empty text (e.g. image-only before history formatting). */
export const EMPTY_USER_HISTORY_PLACEHOLDER = '[screenshot]';
