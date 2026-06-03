export class TranscriptionNotConfiguredError extends Error {
    constructor() {
        super('DEEPGRAM_API_KEY is not configured');
        this.name = 'TranscriptionNotConfiguredError';
    }
}
export class TranscriptionFailedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TranscriptionFailedError';
    }
}
/**
 * Transcribe inbound iMessage voice memos via Deepgram (see Anthropic cookbook:
 * https://platform.claude.com/cookbook/third-party-deepgram-prerecorded-audio).
 */
export async function transcribeAudio(buffer, mimeType, _name) {
    const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
    if (!apiKey)
        throw new TranscriptionNotConfiguredError();
    const model = process.env.DEEPGRAM_MODEL?.trim() || 'nova-3';
    const url = new URL('https://api.deepgram.com/v1/listen');
    url.searchParams.set('model', model);
    url.searchParams.set('smart_format', 'true');
    const language = process.env.DEEPGRAM_LANGUAGE?.trim();
    if (language)
        url.searchParams.set('language', language);
    const timeoutMs = Math.max(15_000, Number.parseInt(process.env.DEEPGRAM_TRANSCRIBE_TIMEOUT_MS ?? '120000', 10) || 120_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Token ${apiKey}`,
                'Content-Type': mimeType || 'audio/mp4',
            },
            body: new Uint8Array(buffer),
            signal: controller.signal,
        });
        const payload = (await response.json());
        if (!response.ok) {
            const detail = payload.err_msg ?? payload.error ?? `HTTP ${response.status}`;
            throw new TranscriptionFailedError(detail);
        }
        const text = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
        if (!text)
            throw new TranscriptionFailedError('empty transcript');
        return text;
    }
    catch (err) {
        if (err instanceof TranscriptionNotConfiguredError || err instanceof TranscriptionFailedError) {
            throw err;
        }
        if (err instanceof Error && err.name === 'AbortError') {
            throw new TranscriptionFailedError('transcription timed out');
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new TranscriptionFailedError(msg);
    }
    finally {
        clearTimeout(timer);
    }
}
