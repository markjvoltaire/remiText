import { composioResultOk, executeComposioTool, formatComposioConnectionError, isComposioConfigured, parseComposioData, TICKETMASTER_TOOLKIT_VERSION, } from './composio.js';
import { eventDetailToSMS, eventsToSMS, parseTicketmasterEventsPayload, } from '../utils/formatEvents.js';
export class TicketmasterNotConfiguredError extends Error {
    constructor() {
        super('Ticketmaster is not configured (set COMPOSIO_API_KEY and connect Ticketmaster in Composio)');
        this.name = 'TicketmasterNotConfiguredError';
    }
}
export class TicketmasterApiError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TicketmasterApiError';
    }
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
export async function searchEvents(userId, params) {
    if (!isComposioConfigured())
        throw new TicketmasterNotConfiguredError();
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
    const events = parseTicketmasterEventsPayload(payload).slice(0, 5);
    return {
        events,
        formatted: eventsToSMS(events),
        raw_count: events.length,
    };
}
export async function getEventDetails(userId, eventId) {
    if (!isComposioConfigured())
        throw new TicketmasterNotConfiguredError();
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
    const event = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : null;
    return {
        formatted: event ? eventDetailToSMS(event) : "couldn't load that event.",
        event,
    };
}
