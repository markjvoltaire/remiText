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
        origin: slice.origin || first.origin.iata_code,
        destination: slice.destination || last.destination.iata_code,
        departureTime: formatHHMM(first.departing_at),
        arrivalTime: formatHHMM(last.arriving_at),
        price: formattedPrice,
        duration: durationBetween(first.departing_at, last.arriving_at),
        stops: Math.max(0, segments.length - 1),
    };
}
