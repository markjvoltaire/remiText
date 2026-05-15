/**
 * Posh marketplace (same catalog as https://posh.vip/explore) via public tRPC.
 */
const EXPLORE_URL = 'https://posh.vip/explore';
const API_BASE = 'https://posh.vip/api/web/v2/trpc/events.fetchMarketplaceEvents';
const DEFAULT_MARKETS = [
    {
        label: 'Miami, FL',
        where: 'Miami, FL',
        lat: 25.7617,
        long: -80.1918,
    },
    {
        label: 'New York, NY',
        where: 'New York, NY',
        lat: 40.7128,
        long: -74.006,
    },
];
/** Broader match when user asks about Haiti / flag day (catch listings that omit keywords). */
const HAITIAN_FLAG_KEYWORD_RE = /haiti|haitian|ayiti|flag\s*day|f[eè]t\s*drapo|drapo|18\s*mai|may\s*18|🇭🇹/i;
const STOP_WORDS = new Set([
    'the',
    'and',
    'for',
    'any',
    'this',
    'that',
    'with',
    'from',
    'what',
    'when',
    'where',
    'are',
    'get',
    'can',
    'you',
    'show',
    'find',
    'like',
    'some',
    'near',
    'nearby',
    'weekend',
    'weekends',
    'week',
    'tonight',
    'today',
    'tomorrow',
    'going',
    'happening',
    'there',
    'please',
    'pls',
]);
function easternYmd(iso) {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function easternWeekdayShort(iso) {
    return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
}
/** `now` wall-clock in America/New_York as YYYY-MM-DD */
function easternTodayYmd(now) {
    return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
/**
 * Build an Eastern calendar window for Posh filters.
 * - tonight: today only
 * - this_weekend: Fri–Sun block (upcoming if Mon–Thu)
 * - this_week: today through ~8 days forward (approx, Eastern)
 */
export function dateWindowForTimeframe(now, timeframe) {
    const today = easternTodayYmd(now);
    const year = Number(today.slice(0, 4));
    if (timeframe === 'tonight') {
        return {
            start: today,
            end: today,
            label: `tonight (${today})`,
            year,
        };
    }
    if (timeframe === 'this_week') {
        const endApprox = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
        const end = endApprox.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        return {
            start: today,
            end,
            label: `${today}–${end} (rolling week)`,
            year,
        };
    }
    // this_weekend — Fri / Sat / Sun in Eastern
    const wd = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
    let start;
    let end;
    if (wd === 'Fri') {
        start = today;
        const endD = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        end = endD.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    }
    else if (wd === 'Sat') {
        start = today;
        const endD = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
        end = endD.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    }
    else if (wd === 'Sun') {
        start = today;
        end = today;
    }
    else {
        let friAnchor;
        for (let i = 0; i < 7; i++) {
            const cand = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
            const w = cand.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
            if (w === 'Fri') {
                friAnchor = cand;
                break;
            }
        }
        const anchor = friAnchor ?? now;
        start = anchor.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const endD = new Date(anchor.getTime() + 2 * 24 * 60 * 60 * 1000);
        end = endD.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    }
    return {
        start,
        end,
        label: `weekend ${start}–${end} Eastern`,
        year: Number(start.slice(0, 4)),
    };
}
function eventKeywordText(e) {
    return [e.name, e.groupName, e.venue?.name, e.venue?.address].filter(Boolean).join(' ');
}
function significantTokens(query) {
    const raw = query
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/\p{M}/gu, '');
    return raw
        .split(/[^a-z0-9]+/i)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}
function queryImpliesHaitian(query) {
    return HAITIAN_FLAG_KEYWORD_RE.test(query);
}
/** Post-filter: tokens must appear in listing text, with Haiti-friendly OR branch when query is about Haiti. */
export function eventMatchesUserIntent(e, query) {
    const hay = eventKeywordText(e).toLowerCase();
    const tokens = significantTokens(query);
    if (tokens.length > 0 && tokens.every((t) => hay.includes(t)))
        return true;
    if (queryImpliesHaitian(query) && HAITIAN_FLAG_KEYWORD_RE.test(eventKeywordText(e)))
        return true;
    return tokens.length === 0;
}
function inDateWindow(iso, start, end) {
    if (!iso)
        return false;
    const ymd = easternYmd(iso);
    return ymd >= start && ymd <= end;
}
function isWeekendDayEvent(iso) {
    if (!iso)
        return false;
    const w = easternWeekdayShort(iso);
    return w === 'Fri' || w === 'Sat' || w === 'Sun';
}
function poshEventUrl(e) {
    return `https://posh.vip/${e.groupUrl}/${e.url}`;
}
function formatEventLine(e, marketLabel) {
    const when = e.startUtc
        ? new Date(e.startUtc).toLocaleString('en-US', {
            timeZone: 'America/New_York',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })
        : 'TBA';
    const place = e.venue?.name ?? marketLabel;
    return `${e.name} — ${when} — ${place} — ${poshEventUrl(e)}`;
}
export function formatPoshNoResults(displayQuery, window, exploreUrl) {
    return `No matching Posh events for "${displayQuery}" (${window.label}). Browse ${exploreUrl} and change city or search.`;
}
export function formatPoshRowsForSms(rows, meta) {
    const lines = rows.map(({ event, marketLabel }) => formatEventLine(event, marketLabel));
    const body = lines.map((l, i) => `${i + 1}) ${l}`).join('\n\n');
    return `${body}\n\nSource: Posh (${meta.exploreUrl}) — ${meta.displayQuery} — ${meta.window.label}.`;
}
async function fetchMarketplacePage(input) {
    const url = `${API_BASE}?input=${encodeURIComponent(JSON.stringify(input))}`;
    const res = await fetch(url, {
        headers: {
            Accept: 'application/json',
            Referer: EXPLORE_URL,
            'User-Agent': 'remitext/1.0 (+https://posh.vip/explore)',
        },
    });
    if (!res.ok) {
        throw new Error(`Posh API HTTP ${res.status}`);
    }
    return (await res.json());
}
async function fetchAllForMarket(market, params) {
    const { apiSearch, window, timeframe, query, maxPages } = params;
    const out = [];
    const seen = new Set();
    let cursor;
    for (let page = 0; page < maxPages; page += 1) {
        const input = {
            sort: 'Trending',
            when: timeframe === 'tonight' ? 'Today' : 'This Week',
            search: apiSearch.slice(0, 120),
            location: { type: 'custom', lat: market.lat, long: market.long, location: market.label },
            secondaryFilters: [],
            where: market.where,
            coordinates: [market.long, market.lat],
            limit: 50,
            clientTimezone: 'America/New_York',
            ...(cursor !== undefined ? { cursor } : {}),
        };
        const body = await fetchMarketplacePage(input);
        const events = body.result?.data?.events ?? [];
        const next = body.result?.data?.nextCursor;
        for (const event of events) {
            if (!inDateWindow(event.startUtc, window.start, window.end))
                continue;
            if (timeframe === 'this_weekend' && !isWeekendDayEvent(event.startUtc))
                continue;
            if (!eventMatchesUserIntent(event, query))
                continue;
            if (seen.has(event._id))
                continue;
            seen.add(event._id);
            out.push({ event, marketLabel: market.label });
        }
        if (next === null || next === undefined || events.length === 0)
            break;
        cursor = next;
    }
    return out;
}
/**
 * Search Posh explore listings from user intent (query + timeframe), Miami & NYC.
 */
export async function searchPoshEvents(params) {
    const now = params.now ?? new Date();
    const window = dateWindowForTimeframe(now, params.when);
    const query = params.query.trim() || 'events';
    const displayQuery = query;
    const apiSearch = significantTokens(query).slice(0, 6).join(' ') || query.slice(0, 80);
    const chunks = await Promise.all(DEFAULT_MARKETS.map((m) => fetchAllForMarket(m, {
        apiSearch,
        window,
        timeframe: params.when,
        query,
        maxPages: 5,
    })));
    const merged = [];
    const dedupe = new Set();
    for (const row of chunks.flat()) {
        if (dedupe.has(row.event._id))
            continue;
        dedupe.add(row.event._id);
        merged.push(row);
    }
    merged.sort((a, b) => {
        const ta = a.event.startUtc ? Date.parse(a.event.startUtc) : 0;
        const tb = b.event.startUtc ? Date.parse(b.event.startUtc) : 0;
        return ta - tb;
    });
    return {
        exploreUrl: EXPLORE_URL,
        window,
        displayQuery,
        rows: merged,
    };
}
/** @deprecated use searchPoshEvents */
export async function searchPoshHaitianFlagDayEvents(options = {}) {
    return searchPoshEvents({
        query: options.theme?.trim() || 'Haitian flag day',
        when: 'this_weekend',
        now: options.now,
    });
}
