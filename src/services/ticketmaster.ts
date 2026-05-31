import {
  composioResultOk,
  executeComposioTool,
  isComposioConfigured,
  parseComposioData,
  type ComposioToolResult,
} from './composio.js';
import {
  eventDetailToSMS,
  eventsToSMS,
  parseTicketmasterEventsPayload,
  type TicketmasterEventSummary,
} from '../utils/formatEvents.js';

export class TicketmasterNotConfiguredError extends Error {
  constructor() {
    super('Ticketmaster is not configured (set COMPOSIO_API_KEY and connect Ticketmaster in Composio)');
    this.name = 'TicketmasterNotConfiguredError';
  }
}

export class TicketmasterApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TicketmasterApiError';
  }
}

function failFromResult(result: ComposioToolResult): never {
  const msg =
    (typeof result.error === 'string' && result.error) ||
    'Ticketmaster search failed. Try again in a moment.';
  throw new TicketmasterApiError(msg);
}

export interface SearchEventsParams {
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

export interface SearchEventsResult {
  events: TicketmasterEventSummary[];
  formatted: string;
  raw_count: number;
}

export async function searchEvents(
  userId: string,
  params: SearchEventsParams,
): Promise<SearchEventsResult> {
  if (!isComposioConfigured()) throw new TicketmasterNotConfiguredError();

  const args: Record<string, unknown> = {
    size: Math.min(5, Math.max(1, params.size ?? 5)),
    sort: 'date,asc',
    countryCode: 'US',
  };

  if (params.city?.trim()) args.city = params.city.trim();
  if (params.stateCode?.trim()) args.stateCode = params.stateCode.trim();
  if (params.keyword?.trim()) args.keyword = params.keyword.trim();
  if (params.startDateTime) args.startDateTime = params.startDateTime;
  if (params.endDateTime) args.endDateTime = params.endDateTime;
  if (params.postalCode?.trim()) args.postalCode = params.postalCode.trim();
  if (params.radius != null) args.radius = params.radius;
  if (params.latlong?.trim()) args.latlong = params.latlong.trim();
  if (params.segmentName?.trim()) args.segmentName = params.segmentName.trim();
  if (params.classificationName?.trim()) args.classificationName = params.classificationName.trim();

  const result = await executeComposioTool('TICKETMASTER_GET_EVENTS', userId, args);
  if (!composioResultOk(result)) failFromResult(result);

  const payload = parseComposioData(result);
  const events = parseTicketmasterEventsPayload(payload).slice(0, 5);

  return {
    events,
    formatted: eventsToSMS(events),
    raw_count: events.length,
  };
}

export async function getEventDetails(
  userId: string,
  eventId: string,
): Promise<{ formatted: string; event: Record<string, unknown> | null }> {
  if (!isComposioConfigured()) throw new TicketmasterNotConfiguredError();

  const result = await executeComposioTool('TICKETMASTER_GET_EVENT_DETAILS', userId, {
    id: eventId,
  });
  if (!composioResultOk(result)) failFromResult(result);

  const payload = parseComposioData(result);
  const event =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;

  return {
    formatted: event ? eventDetailToSMS(event) : "couldn't load that event.",
    event,
  };
}
