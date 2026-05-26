/** Exponential backoff with jitter for Spectrum reconnect attempts. */
export function computeReconnectDelayMs(attempt, options) {
    const baseMs = options?.baseMs ?? 1000;
    const maxMs = options?.maxMs ?? Number(process.env.STREAM_RECONNECT_MAX_BACKOFF_MS ?? 60_000);
    const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
    const jitter = Math.floor(Math.random() * Math.min(1000, exp * 0.2));
    return exp + jitter;
}
/** Longer backoff when Spectrum Cloud returns 429 (createClient is rate-limited). */
export function computeRateLimitReconnectDelayMs(attempt) {
    const baseMs = Number(process.env.STREAM_RATE_LIMIT_BACKOFF_MS ?? 5 * 60 * 1000);
    const maxMs = Number(process.env.STREAM_RATE_LIMIT_MAX_BACKOFF_MS ?? 30 * 60 * 1000);
    return computeReconnectDelayMs(Math.max(0, attempt - 1), { baseMs, maxMs });
}
export function isSpectrumRateLimited(err) {
    if (!err || typeof err !== 'object')
        return false;
    const e = err;
    return e.status === 429 || e.code === 'RATE_LIMITED';
}
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
