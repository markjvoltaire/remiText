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
] as const;

const HAITIAN_FLAG_KEYWORD_RE =
  /haiti|haitian|ayiti|flag\s*day|f[eè]t\s*drapo|drapo|18\s*mai|may\s*18|🇭🇹/i;

export interface PoshMarketplaceEvent {
  _id: string;
  name: string;
  url: string;
  groupUrl: string;
  groupName?: string;
  startUtc?: string;
  venue?: { name?: string; address?: string };
}

export interface PoshEventRow {
  event: PoshMarketplaceEvent;
  marketLabel: string;
}

interface FetchInput {
  sort: 'Trending';
  when: 'This Week' | 'Today';
  search: string;
  location: { type: 'custom'; lat: number; long: number; location: string };
  secondaryFilters: unknown[];
  where: string;
  coordinates: [number, number];
  limit: number;
  clientTimezone: string;
  cursor?: number;
}

interface ApiEnvelope {
  result?: {
    data?: {
      events?: PoshMarketplaceEvent[];
      nextCursor?: number | null;
    };
  };
}

function easternYmd(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Calendar year (America/New_York) of the upcoming May 18 Haitian Flag Day relative to `now`. */
export function haitianFlagDayYear(now: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const y = get('year');
  const m = get('month');
  const d = get('day');
  if (m < 5 || (m === 5 && d <= 18)) return y;
  return y + 1;
}

/** Inclusive Eastern calendar dates (YYYY-MM-DD) around Haitian Flag Day (May 18) for parties. */
export function haitianFlagPartyWindow(now: Date): { start: string; end: string; year: number } {
  const year = haitianFlagDayYear(now);
  return {
    year,
    start: `${year}-05-15`,
    end: `${year}-05-20`,
  };
}

function eventKeywordText(e: PoshMarketplaceEvent): string {
  return [e.name, e.groupName, e.venue?.name, e.venue?.address].filter(Boolean).join(' ');
}

function eventMatchesTheme(e: PoshMarketplaceEvent, theme: string): boolean {
  const hay = eventKeywordText(e);
  if (HAITIAN_FLAG_KEYWORD_RE.test(hay)) return true;
  const t = theme.trim();
  if (!t) return false;
  const parts = t
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (parts.length === 0) return false;
  const lower = hay.toLowerCase();
  return parts.every((p) => lower.includes(p));
}

function inDateWindow(iso: string | undefined, start: string, end: string): boolean {
  if (!iso) return false;
  const ymd = easternYmd(iso);
  return ymd >= start && ymd <= end;
}

function poshEventUrl(e: PoshMarketplaceEvent): string {
  return `https://posh.vip/${e.groupUrl}/${e.url}`;
}

function formatEventLine(e: PoshMarketplaceEvent, marketLabel: string): string {
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

export function formatPoshNoResults(
  theme: string,
  window: { start: string; end: string },
  exploreUrl: string,
): string {
  return `No matching Posh events for ${theme} (${window.start}–${window.end} Eastern) in Miami or NYC. Browse ${exploreUrl} and change city/filters.`;
}

export function formatPoshRowsForSms(
  rows: PoshEventRow[],
  meta: { exploreUrl: string; window: { start: string; end: string; year: number } },
): string {
  const lines = rows.map(({ event, marketLabel }) => formatEventLine(event, marketLabel));
  const body = lines.map((l, i) => `${i + 1}) ${l}`).join('\n\n');
  return `${body}\n\nSource: Posh (${meta.exploreUrl}) — ${meta.window.year} window ${meta.window.start} to ${meta.window.end} Eastern.`;
}

async function fetchMarketplacePage(input: FetchInput): Promise<ApiEnvelope> {
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
  return (await res.json()) as ApiEnvelope;
}

async function fetchAllForMarket(
  market: (typeof DEFAULT_MARKETS)[number],
  theme: string,
  window: { start: string; end: string },
  maxPages: number,
): Promise<Array<{ event: PoshMarketplaceEvent; marketLabel: string }>> {
  const out: Array<{ event: PoshMarketplaceEvent; marketLabel: string }> = [];
  const seen = new Set<string>();
  let cursor: number | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const input: FetchInput = {
      sort: 'Trending',
      when: 'This Week',
      search: '',
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
      const themed = eventMatchesTheme(event, theme);
      const inWin = inDateWindow(event.startUtc, window.start, window.end);
      if (!themed || !inWin) continue;
      if (seen.has(event._id)) continue;
      seen.add(event._id);
      out.push({ event, marketLabel: market.label });
    }
    if (next === null || next === undefined || events.length === 0) break;
    cursor = next;
  }
  return out;
}

export interface SearchPoshEventsOptions {
  /** Natural phrase; Haitian Flag Day–style keywords are always considered when theme mentions Haiti/flag. */
  theme?: string;
  /** ISO timestamp anchor for which year's May 18 window to use. */
  now?: Date;
}

export interface SearchPoshHaitianFlagDayResult {
  rows: PoshEventRow[];
  exploreUrl: string;
  window: { start: string; end: string; year: number };
  theme: string;
}

/**
 * Find Posh listings for Haitian Flag Day weekend (Eastern May 15–20) in major markets.
 * Same inventory as the explore page; uses Posh's public marketplace API.
 */
export async function searchPoshHaitianFlagDayEvents(
  options: SearchPoshEventsOptions = {},
): Promise<SearchPoshHaitianFlagDayResult> {
  const now = options.now ?? new Date();
  const window = haitianFlagPartyWindow(now);
  const theme = options.theme?.trim() || 'Haitian Flag Day';

  const chunks = await Promise.all(
    DEFAULT_MARKETS.map((m) => fetchAllForMarket(m, theme, window, 4)),
  );
  const merged: PoshEventRow[] = [];
  const dedupe = new Set<string>();
  for (const row of chunks.flat()) {
    if (dedupe.has(row.event._id)) continue;
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
    theme,
    rows: merged,
  };
}
