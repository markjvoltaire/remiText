import { composioResultOk, executeComposioTool, formatComposioConnectionError, isComposioConfigured, parseComposioData, TICKETMASTER_TOOLKIT_VERSION, } from './composio.js';
import { getEventDetailsDiscovery, isTicketmasterDiscoveryConfigured, searchEventsDiscovery, } from './ticketmasterDiscovery.js';
import { eventDetailToSMS, eventsToSMS, parseTicketmasterEventsPayload, } from '../utils/formatEvents.js';
export class TicketmasterNotConfiguredError extends Error {
    constructor() {
        super('Ticketmaster is not configured. Set TICKETMASTER_API_KEY (Discovery consumer key) on the worker.');
        this.name = 'TicketmasterNotConfiguredError';
    }
}
export class TicketmasterApiError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TicketmasterApiError';
    }
}
/** True when Discovery API key or Composio is available. */
export function isTicketmasterConfigured() {
    return isTicketmasterDiscoveryConfigured() || isComposioConfigured();
}
function failFromResult(result) {
    const raw = (typeof result.error === 'string' && result.error) ||
        'Ticketmaster search failed. Try again in a moment.';
    throw new TicketmasterApiError(formatComposioConnectionError(raw));
}
function failFromExecuteError(err) {
    const raw = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause instanceof Error
        ? err.cause.message
        : err instanceof Error && typeof err.cause === 'object'
            ? String(err.cause?.message ?? '')
            : '';
    const combined = [raw, cause].filter(Boolean).join(' — ');
    throw new TicketmasterApiError(formatComposioConnectionError(combined));
}
async function searchEventsViaComposio(userId, params) {
    const args = {
        size: Math.min(5, Math.max(1, params.size ?? 5)),
        sort: 'date,asc',
        countryCode: 'US',
    };
    if (params.city?.trim())
        args.city = params.city.trim();
    if (params.stateCode?.trim())
        args.stateCode = params.stateCode.trim();
    if (params.keyword?.trim())
        args.keyword = params.keyword.trim();
    if (params.startDateTime)
        args.startDateTime = params.startDateTime;
    if (params.endDateTime)
        args.endDateTime = params.endDateTime;
    if (params.postalCode?.trim())
        args.postalCode = params.postalCode.trim();
    if (params.radius != null)
        args.radius = params.radius;
    if (params.latlong?.trim())
        args.latlong = params.latlong.trim();
    if (params.segmentName?.trim())
        args.segmentName = params.segmentName.trim();
    if (params.classificationName?.trim())
        args.classificationName = params.classificationName.trim();
    let result;
    try {
        result = await executeComposioTool('TICKETMASTER_GET_EVENTS', userId, args, {
            version: TICKETMASTER_TOOLKIT_VERSION,
        });
    }
    catch (err) {
        failFromExecuteError(err);
    }
    if (!composioResultOk(result))
        failFromResult(result);
    const payload = parseComposioData(result);
    return parseTicketmasterEventsPayload(payload).slice(0, 5);
}
export async function searchEvents(userId, params) {
    if (!isTicketmasterConfigured())
        throw new TicketmasterNotConfiguredError();
    let events;
    if (isTicketmasterDiscoveryConfigured()) {
        events = await searchEventsDiscovery(params);
    }
    else if (isComposioConfigured()) {
        events = await searchEventsViaComposio(userId, params);
    }
    else {
        throw new TicketmasterNotConfiguredError();
    }
    return {
        events,
        formatted: eventsToSMS(events),
        raw_count: events.length,
    };
}
export async function getEventDetails(userId, eventId) {
    if (!isTicketmasterConfigured())
        throw new TicketmasterNotConfiguredError();
    let event;
    if (isTicketmasterDiscoveryConfigured()) {
        event = await getEventDetailsDiscovery(eventId);
    }
    else {
        let result;
        try {
            result = await executeComposioTool('TICKETMASTER_GET_EVENT_DETAILS', userId, { id: eventId }, { version: TICKETMASTER_TOOLKIT_VERSION });
        }
        catch (err) {
            failFromExecuteError(err);
        }
        if (!composioResultOk(result))
            failFromResult(result);
        const payload = parseComposioData(result);
        event =
            payload && typeof payload === 'object' && !Array.isArray(payload)
                ? payload
                : null;
    }
    return {
        formatted: event ? eventDetailToSMS(event) : "couldn't load that event.",
        event,
    };
}
