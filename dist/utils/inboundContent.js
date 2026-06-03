const MAX_IMAGES = Math.max(1, Math.min(5, Number.parseInt(process.env.REMI_INBOUND_IMAGE_MAX ?? '3', 10) || 3));
const MAX_VOICE = Math.max(1, Math.min(3, Number.parseInt(process.env.REMI_INBOUND_AUDIO_MAX ?? '1', 10) || 1));
const MAX_IMAGE_BYTES = Math.max(512_000, Math.min(10 * 1024 * 1024, Number.parseInt(process.env.REMI_INBOUND_IMAGE_MAX_BYTES ?? '5242880', 10) || 5_242_880));
const MAX_VOICE_BYTES = Math.max(512_000, Math.min(25 * 1024 * 1024, Number.parseInt(process.env.REMI_INBOUND_AUDIO_MAX_BYTES ?? '25165824', 10) || 25_165_824));
/** Prefer stream() for large clips per Spectrum voice/attachment docs. */
const STREAM_THRESHOLD_BYTES = Math.max(256_000, Number.parseInt(process.env.REMI_INBOUND_VOICE_STREAM_THRESHOLD_BYTES ?? '1048576', 10) || 1_048_576);
const CLAUDE_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]);
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
function isImageMimeType(mimeType) {
    return mimeType.toLowerCase().startsWith('image/');
}
function isAudioMimeType(mimeType) {
    return mimeType.toLowerCase().startsWith('audio/');
}
function hasMediaLikeContent(content) {
    if (!content || typeof content !== 'object')
        return false;
    const record = content;
    if (record.type === 'attachment' || record.type === 'voice')
        return true;
    if (record.type === 'group' && Array.isArray(record.items)) {
        return record.items.some((item) => {
            if (!item || typeof item !== 'object')
                return false;
            const itemContent = 'content' in item ? item.content : item;
            return hasMediaLikeContent(itemContent);
        });
    }
    return false;
}
async function streamToBuffer(stream) {
    const reader = stream.getReader();
    const chunks = [];
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (value instanceof Uint8Array && value.length > 0) {
                chunks.push(Buffer.from(value));
            }
            else if (value instanceof ArrayBuffer) {
                chunks.push(Buffer.from(value));
            }
        }
    }
    finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks);
}
/** Materialize bytes from Spectrum voice or attachment content (read / stream). */
async function materializeSpectrumBytes(readable, label) {
    const size = typeof readable.size === 'number' ? readable.size : undefined;
    const preferStream = size != null && size > STREAM_THRESHOLD_BYTES;
    try {
        if (preferStream && typeof readable.stream === 'function') {
            const stream = await readable.stream();
            return await streamToBuffer(stream);
        }
        if (typeof readable.read === 'function') {
            const raw = await readable.read();
            return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        }
        if (typeof readable.stream === 'function') {
            const stream = await readable.stream();
            return await streamToBuffer(stream);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[inbound] ${label} byte read failed: ${msg}`);
    }
    return null;
}
async function convertHeicToJpeg(buffer) {
    const convert = (await import('heic-convert')).default;
    const converted = await convert({
        buffer,
        format: 'JPEG',
        quality: 0.92,
    });
    return Buffer.from(converted);
}
async function normalizeImageForClaude(buffer, mimeType, name) {
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
        console.warn(`[inbound] skip image ${name}: ${buffer.length === 0 ? 'empty' : `too large (${buffer.length} bytes)`}`);
        return null;
    }
    const lower = mimeType.toLowerCase();
    let mediaType = null;
    let output = buffer;
    if (CLAUDE_IMAGE_TYPES.has(lower)) {
        mediaType = lower;
    }
    else if (lower === 'image/heic' || lower === 'image/heif') {
        try {
            output = await convertHeicToJpeg(buffer);
            mediaType = 'image/jpeg';
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[inbound] HEIC convert failed for ${name}: ${msg}`);
            return null;
        }
    }
    else {
        console.warn(`[inbound] unsupported image mime type ${mimeType} for ${name}`);
        return null;
    }
    if (output.length > MAX_IMAGE_BYTES) {
        console.warn(`[inbound] skip image ${name}: converted size ${output.length} exceeds limit`);
        return null;
    }
    return { buffer: output, mediaType, name };
}
function normalizeVoice(buffer, params) {
    if (buffer.length === 0 || buffer.length > MAX_VOICE_BYTES) {
        console.warn(`[inbound] skip voice ${params.name}: ${buffer.length === 0 ? 'empty' : `too large (${buffer.length} bytes)`}`);
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
async function collectVoiceFromVoiceContent(content) {
    const buffer = await materializeSpectrumBytes(content, 'voice');
    if (!buffer)
        return null;
    return normalizeVoice(buffer, {
        mimeType: content.mimeType,
        name: content.name ?? 'note.m4a',
        durationSeconds: typeof content.duration === 'number' && Number.isFinite(content.duration)
            ? content.duration
            : undefined,
        sizeBytes: typeof content.size === 'number' ? content.size : undefined,
        source: 'voice',
    });
}
async function collectVoiceFromAudioAttachment(content) {
    const buffer = await materializeSpectrumBytes(content, `attachment:${content.name}`);
    if (!buffer)
        return null;
    return normalizeVoice(buffer, {
        mimeType: content.mimeType,
        name: content.name,
        sizeBytes: typeof content.size === 'number' ? content.size : undefined,
        source: 'attachment',
    });
}
async function collectMediaFromContent(content) {
    const images = [];
    const voice = [];
    async function walk(node) {
        if (images.length >= MAX_IMAGES && voice.length >= MAX_VOICE)
            return;
        if (!node || typeof node !== 'object')
            return;
        const record = node;
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
                if (voice.length >= MAX_VOICE)
                    return;
                const clip = await collectVoiceFromVoiceContent(node);
                if (clip)
                    voice.push(clip);
                return;
            }
            case 'attachment': {
                const attachment = node;
                const mimeType = attachment.mimeType;
                if (isImageMimeType(mimeType) && images.length < MAX_IMAGES) {
                    const buffer = await materializeSpectrumBytes(attachment, `attachment:${attachment.name}`);
                    if (buffer) {
                        const normalized = await normalizeImageForClaude(buffer, mimeType, attachment.name);
                        if (normalized)
                            images.push(normalized);
                    }
                }
                else if (isAudioMimeType(mimeType) && voice.length < MAX_VOICE) {
                    const clip = await collectVoiceFromAudioAttachment(attachment);
                    if (clip)
                        voice.push(clip);
                }
                return;
            }
            case 'group': {
                const group = node;
                for (const item of group.items) {
                    if (images.length >= MAX_IMAGES && voice.length >= MAX_VOICE)
                        break;
                    await walk(item.content);
                }
                return;
            }
            case 'reply':
            case 'edit':
            case 'effect': {
                const wrapped = node;
                if (wrapped.content)
                    await walk(wrapped.content);
                return;
            }
            default:
                return;
        }
    }
    await walk(content);
    return { images, voice };
}
export async function extractInboundContent(message) {
    const content = message.content;
    const text = extractText(content);
    const { images, voice } = await collectMediaFromContent(content);
    return { text, images, voice };
}
export function inboundHasReadableMedia(inbound) {
    return inbound.images.length > 0 || inbound.voice.length > 0;
}
export function messageHasUnprocessedMedia(content, inbound) {
    return hasMediaLikeContent(content) && !inboundHasReadableMedia(inbound);
}
export function formatUserTurnForHistory(text, opts) {
    const trimmed = text.trim();
    const voiceLine = opts.voiceTranscript?.trim();
    let result = trimmed;
    if (voiceLine) {
        result = result ? `${result}\n\n[voice memo] ${voiceLine}` : `[voice memo] ${voiceLine}`;
    }
    if (opts.hasImages) {
        if (!result)
            result = '[screenshot]';
        else if (!result.startsWith('[screenshot]'))
            result = `[screenshot] ${result}`;
    }
    return result || text;
}
export function mergeVoiceTranscript(text, transcript) {
    const trimmedText = text.trim();
    const trimmedVoice = transcript.trim();
    if (!trimmedVoice)
        return trimmedText;
    if (!trimmedText)
        return trimmedVoice;
    return `${trimmedText}\n\n${trimmedVoice}`;
}
export const IMAGE_ONLY_USER_HINT = 'The user sent a screenshot or photo with no caption. Read it carefully — it may be a message thread, reservation, flight, menu, or something they want help acting on. Summarize what you see and help, or ask one short clarifying question if needed.';
