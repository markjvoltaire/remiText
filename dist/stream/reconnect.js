/** Exponential backoff with jitter for Spectrum reconnect attempts. */
export function computeReconnectDelayMs(attempt, options) {
    const baseMs = options?.baseMs ?? 1000;
    const maxMs = options?.maxMs ?? Number(process.env.STREAM_RECONNECT_MAX_BACKOFF_MS ?? 60_000);
    const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
    const jitter = Math.floor(Math.random() * Math.min(1000, exp * 0.2));
    return exp + jitter;
}
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
