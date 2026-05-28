/** Exponential backoff with jitter for Spectrum reconnect attempts. */
function errorMessage(err) {
    if (err instanceof Error)
        return err.message;
    if (err && typeof err === 'object' && 'message' in err) {
        return String(err.message);
    }
    return String(err);
}
export function computeReconnectDelayMs(attempt, options) {
    const baseMs = options?.baseMs ?? 1000;
    const maxMs = options?.maxMs ?? Number(process.env.STREAM_RECONNECT_MAX_BACKOFF_MS ?? 60_000);
    const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
    const jitter = Math.floor(Math.random() * Math.min(1000, exp * 0.2));
    return exp + jitter;
}
/** Parse "Retry after 60s" from Spectrum rate-limit errors. */
export function parseRetryAfterMs(err) {
    const msg = errorMessage(err);
    const sec = msg.match(/retry\s+after\s+(\d+)\s*s(?:ec(?:ond)?s?)?/i);
    if (sec) {
        const n = Number(sec[1]);
        return Number.isFinite(n) && n > 0 ? n * 1000 : null;
    }
    return null;
}
/** Longer backoff when Spectrum Cloud returns 429 (createClient is rate-limited). */
export function computeRateLimitReconnectDelayMs(attempt, err) {
    const baseMs = Number(process.env.STREAM_RATE_LIMIT_BACKOFF_MS ?? 60 * 1000);
    const maxMs = Number(process.env.STREAM_RATE_LIMIT_MAX_BACKOFF_MS ?? 30 * 60 * 1000);
    const computed = computeReconnectDelayMs(Math.max(0, attempt - 1), { baseMs, maxMs });
    const fromApi = err != null ? parseRetryAfterMs(err) : null;
    if (fromApi != null) {
        return Math.max(computed, fromApi + 5_000);
    }
    return computed;
}
export function isSpectrumRateLimited(err) {
    if (!err || typeof err !== 'object')
        return false;
    const e = err;
    if (e.status === 429 || e.code === 'RATE_LIMITED')
        return true;
    const msg = errorMessage(err);
    return /rate\s*limit/i.test(msg) || /\b429\b/.test(msg);
}
/** Spectrum 5xx / vague cloud errors — back off harder to avoid ip_per_minute burn. */
export function isTransientSpectrumConnectError(err) {
    const msg = errorMessage(err).toLowerCase();
    return (msg.includes('internal server error') ||
        msg.includes('service unavailable') ||
        msg.includes('bad gateway'));
}
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
