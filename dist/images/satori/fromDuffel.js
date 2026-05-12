function formatHHMM24(iso) {
    if (!iso)
        return '';
    return iso.split('T')[1]?.slice(0, 5) ?? '';
}
function formatShortMonthDay(dateStr) {
    const date = new Date(`${dateStr}T12:00:00Z`);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    });
}
function durationBetween(start, end) {
    if (!start || !end)
        return '';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(ms) || ms <= 0)
        return '';
    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0)
        return `${minutes}m`;
    if (minutes === 0)
        return `${hours}h`;
    return `${hours}h ${minutes}m`;
}
function stopsLabel(segmentCount) {
    const stops = Math.max(0, segmentCount - 1);
    if (stops <= 0)
        return 'Nonstop';
    if (stops === 1)
        return '1 stop';
    return `${stops} stops`;
}
function segmentMeta(slice, segments) {
    const first = segments[0];
    const last = segments[segments.length - 1];
    const originCity = first.origin.city_name?.trim() || undefined;
    const destinationCity = last.destination.city_name?.trim() || undefined;
    const aircraft = first.aircraft_name?.trim() || undefined;
    return {
        airline: first.marketing_carrier_name,
        origin: slice.origin || first.origin.iata_code,
        destination: slice.destination || last.destination.iata_code,
        departureTime: formatHHMM24(first.departing_at),
        arrivalTime: formatHHMM24(last.arriving_at),
        duration: durationBetween(first.departing_at, last.arriving_at),
        tripSummary: `${formatShortMonthDay(slice.departure_date)} - ${stopsLabel(segments.length)}`,
        originCity,
        destinationCity,
        aircraft,
    };
}
/**
 * Build a `FlightCardInput` from a Duffel-derived `HeldOrder`, using the
 * outbound slice as the canonical "trip" the card represents. Pricing must
 * be passed in already-formatted (e.g. "$248") to match what we tell the
 * user over SMS — we never recompute markup here.
 */
export function flightCardInputFromHeldOrder(order, formattedPrice) {
    const slice = order.slices[0];
    if (!slice)
        return null;
    const segments = slice.segments;
    if (segments.length === 0)
        return null;
    return {
        ...segmentMeta(slice, segments),
        price: formattedPrice,
    };
}
/**
 * Build a `FlightCardInput` from a search-result `FlightOffer`. The outbound
 * slice is used as the canonical leg, which matches how `offersToSMS` renders
 * the option list (one line per offer keyed off slice[0]).
 */
export function flightCardInputFromOffer(offer, formattedPrice) {
    const slice = offer.slices[0];
    if (!slice)
        return null;
    const segments = slice.segments;
    if (segments.length === 0)
        return null;
    return {
        ...segmentMeta(slice, segments),
        price: formattedPrice,
    };
}
