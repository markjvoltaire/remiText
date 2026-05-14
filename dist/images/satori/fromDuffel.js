function formatHHMM(iso) {
    if (!iso)
        return '';
    const time = iso.split('T')[1]?.slice(0, 5);
    if (!time)
        return '';
    const [hStr, m] = time.split(':');
    const hour = Number.parseInt(hStr ?? '0', 10);
    if (Number.isNaN(hour))
        return time;
    const suffix = hour < 12 ? 'AM' : 'PM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${suffix}`;
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
function ordinal(day) {
    const rem100 = day % 100;
    if (rem100 >= 11 && rem100 <= 13)
        return `${day}th`;
    switch (day % 10) {
        case 1:
            return `${day}st`;
        case 2:
            return `${day}nd`;
        case 3:
            return `${day}rd`;
        default:
            return `${day}th`;
    }
}
function formatDisplayDate(dateStr) {
    if (!dateStr)
        return '';
    const date = new Date(`${dateStr}T12:00:00Z`);
    if (Number.isNaN(date.getTime()))
        return dateStr;
    const month = date.toLocaleDateString('en-US', {
        month: 'long',
        timeZone: 'UTC',
    });
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();
    return `${month} ${ordinal(day)} ${year}`;
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
    const first = segments[0];
    const last = segments[segments.length - 1];
    return {
        airline: first.marketing_carrier_name,
        logoUrl: first.marketing_carrier_logo_lockup_url,
        origin: slice.origin || first.origin.iata_code,
        destination: slice.destination || last.destination.iata_code,
        departureTime: formatHHMM(first.departing_at),
        arrivalTime: formatHHMM(last.arriving_at),
        price: formattedPrice,
        duration: durationBetween(first.departing_at, last.arriving_at),
        stops: Math.max(0, segments.length - 1),
        date: formatDisplayDate(slice.departure_date),
        cabinClass: 'Economy',
        flightNumber: first.flight_number,
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
    const first = segments[0];
    const last = segments[segments.length - 1];
    return {
        airline: first.marketing_carrier_name,
        logoUrl: first.marketing_carrier_logo_lockup_url,
        origin: slice.origin || first.origin.iata_code,
        destination: slice.destination || last.destination.iata_code,
        departureTime: formatHHMM(first.departing_at),
        arrivalTime: formatHHMM(last.arriving_at),
        price: formattedPrice,
        duration: durationBetween(first.departing_at, last.arriving_at),
        stops: Math.max(0, segments.length - 1),
        date: formatDisplayDate(slice.departure_date),
        cabinClass: 'Economy',
        flightNumber: first.flight_number,
    };
}
