import {
  parseTicketmasterEventsPayload,
  type TicketmasterEventSummary,
} from '../utils/formatEvents.js';

export interface DiscoverySearchParams {
  city?: string;
  stateCode?: string;
  keyword?: string;
  startDateTime?: string;
  endDateTime?: string;
  postalCode?: string;
  radius?: number;
  latlong?: string;
  segmentName?: string;
  classificationName?: string;
  size?: number;
}

const DISCOVERY_BASE = 'https://app.ticketmaster.com/discovery/v2';

export function isTicketmasterDiscoveryConfigured(): boolean {
  return Boolean(process.env.TICKETMASTER_API_KEY?.trim());
}

function discoveryApiKey(): string {
  const key = process.env.TICKETMASTER_API_KEY?.trim();
  if (!key) throw new Error('TICKETMASTER_API_KEY is not set');
  return key;
}

function buildSearchQuery(params: DiscoverySearchParams): URLSearchParams {
  const query = new URLSearchParams({
    apikey: discoveryApiKey(),
    size: String(Math.min(5, Math.max(1, params.size ?? 5))),
    sort: 'date,asc',
    countryCode: 'US',
  });

  if (params.city?.trim()) query.set('city', params.city.trim());
  if (params.stateCode?.trim()) query.set('stateCode', params.stateCode.trim());
  if (params.keyword?.trim()) query.set('keyword', params.keyword.trim());
  if (params.startDateTime) query.set('startDateTime', params.startDateTime);
  if (params.endDateTime) query.set('endDateTime', params.endDateTime);
  if (params.postalCode?.trim()) query.set('postalCode', params.postalCode.trim());
  if (params.radius != null) query.set('radius', String(params.radius));
  if (params.latlong?.trim()) query.set('latlong', params.latlong.trim());
  if (params.segmentName?.trim()) query.set('segmentName', params.segmentName.trim());
  if (params.classificationName?.trim()) {
    query.set('classificationName', params.classificationName.trim());
  }

  return query;
}

async function discoveryFetch(path: string, query: URLSearchParams): Promise<unknown> {
  const url = `${DISCOVERY_BASE}${path}?${query.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const detail =
      body && typeof body === 'object' && body !== null && 'fault' in body
        ? JSON.stringify((body as { fault?: unknown }).fault)
        : typeof body === 'string'
          ? body.slice(0, 200)
          : `HTTP ${res.status}`;
    throw new Error(`Ticketmaster Discovery API error (${res.status}): ${detail}`);
  }

  return body;
}

export async function searchEventsDiscovery(
  params: DiscoverySearchParams,
): Promise<TicketmasterEventSummary[]> {
  const payload = await discoveryFetch('/events.json', buildSearchQuery(params));
  return parseTicketmasterEventsPayload(payload).slice(0, 5);
}

export async function getEventDetailsDiscovery(
  eventId: string,
): Promise<Record<string, unknown> | null> {
  const query = new URLSearchParams({ apikey: discoveryApiKey() });
  const payload = await discoveryFetch(`/events/${encodeURIComponent(eventId)}.json`, query);
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}
