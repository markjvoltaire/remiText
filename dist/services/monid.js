const MONID_API_BASE = process.env.MONID_API_BASE_URL ?? 'https://api.monid.ai';
const TIKTOK_PROVIDER = 'apify';
const TIKTOK_ENDPOINT = '/apidojo/tiktok-scraper';
const INSTAGRAM_PROVIDER = 'apify';
const INSTAGRAM_ENDPOINT = '/apify/instagram-hashtag-scraper';
const DEFAULT_MAX_ITEMS = Math.min(15, Math.max(5, Number.parseInt(process.env.MONID_SOCIAL_MAX_ITEMS ?? '8', 10) || 8));
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = Math.min(120_000, Math.max(30_000, Number.parseInt(process.env.MONID_POLL_MAX_MS ?? '90000', 10) || 90_000));
export class MonidNotConfiguredError extends Error {
    constructor() {
        super('Monid is not configured (missing MONID_API_KEY)');
        this.name = 'MonidNotConfiguredError';
    }
}
export class MonidApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.name = 'MonidApiError';
        this.status = status;
    }
}
function apiKey() {
    const key = process.env.MONID_API_KEY?.trim();
    if (!key)
        throw new MonidNotConfiguredError();
    return key;
}
async function monidFetch(path, init) {
    const url = `${MONID_API_BASE}${path}`;
    const res = await fetch(url, {
        ...init,
        headers: {
            Authorization: `Bearer ${apiKey()}`,
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    });
    return res;
}
async function parseJson(res) {
    const text = await res.text();
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        throw new MonidApiError(res.status, text.slice(0, 300));
    }
}
function runErrorMessage(data, fallback) {
    const err = data.error;
    return err?.message ?? data.message ?? fallback;
}
async function startRun(provider, endpoint, input) {
    const res = await monidFetch('/v1/run', {
        method: 'POST',
        body: JSON.stringify({ provider, endpoint, input }),
    });
    const data = await parseJson(res);
    if (res.status === 401 || res.status === 403) {
        throw new MonidApiError(res.status, 'Monid API key is invalid or unauthorized');
    }
    if (res.status === 402) {
        throw new MonidApiError(res.status, 'Monid workspace balance is too low');
    }
    if (!res.ok && res.status !== 202) {
        throw new MonidApiError(res.status, runErrorMessage(data, `Monid run failed (${res.status})`));
    }
    return data;
}
async function getRun(runId) {
    const res = await monidFetch(`/v1/runs/${encodeURIComponent(runId)}`);
    const data = await parseJson(res);
    if (!res.ok) {
        throw new MonidApiError(res.status, runErrorMessage(data, `Monid get run failed (${res.status})`));
    }
    return data;
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function waitForRun(runId) {
    const deadline = Date.now() + POLL_MAX_MS;
    let run = await getRun(runId);
    while (run.status === 'READY' || run.status === 'RUNNING') {
        if (Date.now() >= deadline) {
            throw new MonidApiError(408, `Monid run ${runId} timed out after ${POLL_MAX_MS}ms`);
        }
        await delay(POLL_INTERVAL_MS);
        run = await getRun(runId);
    }
    if (run.status === 'FAILED') {
        const msg = run.error?.message ??
            'Monid run failed during execution';
        throw new MonidApiError(500, msg);
    }
    const httpStatus = run.providerResponse?.httpStatus;
    if (httpStatus != null && httpStatus >= 400) {
        throw new MonidApiError(httpStatus, `Provider returned HTTP ${httpStatus}`);
    }
    return run;
}
async function executeEndpoint(provider, endpoint, input) {
    const started = await startRun(provider, endpoint, input);
    if (started.status === 'COMPLETED') {
        return normalizeOutput(started.output);
    }
    const finished = await waitForRun(started.runId);
    return normalizeOutput(finished.output);
}
function normalizeOutput(output) {
    if (output == null)
        return [];
    if (Array.isArray(output))
        return output;
    if (typeof output === 'object') {
        const obj = output;
        if (Array.isArray(obj.items))
            return obj.items;
        if (Array.isArray(obj.data))
            return obj.data;
        if (Array.isArray(obj.results))
            return obj.results;
    }
    return [output];
}
/** One keyword per call to control per-result billing. */
export function normalizeTikTokKeywords(keywords) {
    const out = [];
    for (const raw of keywords) {
        const k = raw.trim();
        if (!k)
            continue;
        out.push(k);
        if (out.length >= 1)
            break;
    }
    return out;
}
/** One hashtag per call; strips leading #. */
export function normalizeInstagramHashtags(hashtags) {
    const out = [];
    for (const raw of hashtags) {
        const h = raw.trim().replace(/^#+/, '').replace(/\s+/g, '');
        if (!h)
            continue;
        out.push(h);
        if (out.length >= 1)
            break;
    }
    return out;
}
export async function searchTikTokPosts(params) {
    const keywords = normalizeTikTokKeywords(params.keywords);
    if (keywords.length === 0)
        return [];
    const input = {
        keywords,
        maxItems: params.maxItems ?? DEFAULT_MAX_ITEMS,
    };
    if (params.dateRange) {
        input.dateRange = params.dateRange;
    }
    return executeEndpoint(TIKTOK_PROVIDER, TIKTOK_ENDPOINT, input);
}
export async function searchInstagramHashtag(params) {
    const hashtags = normalizeInstagramHashtags(params.hashtags);
    if (hashtags.length === 0)
        return [];
    const input = {
        hashtags,
        resultsType: 'posts',
        resultsLimit: params.resultsLimit ?? DEFAULT_MAX_ITEMS,
    };
    return executeEndpoint(INSTAGRAM_PROVIDER, INSTAGRAM_ENDPOINT, input);
}
export async function runSocialDiscovery(params) {
    const [tiktokRaw, instagramRaw] = await Promise.all([
        searchTikTokPosts({ keywords: params.tiktokKeywords, dateRange: 'THIS_WEEK' }).catch((err) => {
            console.warn('[monid] TikTok search failed:', err instanceof Error ? err.message : err);
            return [];
        }),
        searchInstagramHashtag({ hashtags: params.instagramHashtags }).catch((err) => {
            console.warn('[monid] Instagram search failed:', err instanceof Error ? err.message : err);
            return [];
        }),
    ]);
    const tiktokEmpty = tiktokRaw.length === 0;
    const instagramEmpty = instagramRaw.length === 0;
    return {
        location: params.location,
        vibe: params.vibe,
        tiktok: { items: tiktokRaw, empty: tiktokEmpty },
        instagram: { items: instagramRaw, empty: instagramEmpty },
        both_empty: tiktokEmpty && instagramEmpty,
    };
}
export function isMonidConfigured() {
    return Boolean(process.env.MONID_API_KEY?.trim());
}
