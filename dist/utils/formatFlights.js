import { computeAllInPrice, formatMoneyFromCents } from './pricing.js';
import { formatHumanDate } from './smsFormat.js';
function formatTime(hhmm) {
    const [hourStr, min] = hhmm.split(':');
    const hour = parseInt(hourStr, 10);
    const suffix = hour < 12 ? 'a' : 'p';
    const h12 = hour % 12 || 12;
    return `${h12}:${min}${suffix}`;
}
function extractHHMM(isoDatetime) {
    // "2026-05-08T05:25:00" → "05:25"
    return isoDatetime.split('T')[1]?.slice(0, 5) ?? '00:00';
}
export function formatFlightOptionsSMS(route, options) {
    const sorted = [...options].sort((a, b) => {
        const pa = Number.parseFloat(a.price.replace(/[^0-9.]/g, '')) || 0;
        const pb = Number.parseFloat(b.price.replace(/[^0-9.]/g, '')) || 0;
        return pa - pb;
    });
    const arrow = route.return_date ? '↔' : '→';
    const datePart = route.return_date
        ? `${formatHumanDate(route.date)} – ${formatHumanDate(route.return_date)}`
        : formatHumanDate(route.date);
    const header = `${route.from} ${arrow} ${route.to} · ${datePart}`;
    const blocks = sorted.map((f) => {
        const out = `Depart: ${formatTime(f.departure_time)} → ${formatTime(f.arrival_time)}`;
        const ret = f.return_departure_time && f.return_arrival_time
            ? `Return: ${formatTime(f.return_departure_time)} → ${formatTime(f.return_arrival_time)}`
            : null;
        return [
            `${f.price} — ${f.airline} · ${f.flight_number}`,
            out,
            ...(ret ? [ret] : []),
        ].join('\n');
    });
    return [header, ...blocks].join('\n\n');
}
export function formatHeldOrderConfirmationSMS(summary) {
    const arrow = summary.return_date ? '↔' : '→';
    const datePart = summary.return_date
        ? `${formatHumanDate(summary.depart_date)} – ${formatHumanDate(summary.return_date)}`
        : formatHumanDate(summary.depart_date);
    const out = `Depart: ${formatTime(summary.depart_time)} → ${formatTime(summary.arrive_time)}`;
    const ret = summary.return_date && summary.return_depart_time && summary.return_arrive_time
        ? `Return: ${formatTime(summary.return_depart_time)} → ${formatTime(summary.return_arrive_time)}`
        : null;
    return [
        'Confirm this flight',
        '',
        summary.airline,
        `${summary.from} ${arrow} ${summary.to} · ${datePart}`,
        '',
        out,
        ...(ret ? [ret] : []),
        `${summary.price}`,
        '',
        'Reply HOLD to reserve it',
        'or BOOK to purchase now',
    ].join('\n');
}
export function formatFlightConfirmationSMS(details) {
    const required = ['airline', 'from', 'to', 'date', 'departure_time', 'arrival_time', 'price'];
    for (const key of required) {
        if (details[key] === undefined || details[key] === null || details[key] === '') {
            throw new Error(`formatFlightConfirmationSMS: missing required field "${key}"`);
        }
    }
    const dep = formatTime(details.departure_time);
    const arr = formatTime(details.arrival_time);
    return [
        'Confirm this flight',
        '',
        details.airline,
        `${details.from} → ${details.to} · ${details.date}`,
        '',
        `${dep} → ${arr}`,
        `${details.price}`,
        '',
        'Reply HOLD to reserve it',
        'or BOOK to purchase now',
    ].join('\n');
}
/** Cheapest first (all-in charge cents). */
export function sortFlightOffersByPrice(offers) {
    return [...offers].sort((a, b) => {
        const pa = computeAllInPrice(a.total_amount, a.total_currency).chargeAmountCents;
        const pb = computeAllInPrice(b.total_amount, b.total_currency).chargeAmountCents;
        return pa - pb;
    });
}
export function offersToSMS(offers, limit) {
    if (offers.length === 0)
        return 'No flights found for that route and date.';
    const sortedOffers = sortFlightOffersByPrice(offers);
    const trimmed = typeof limit === 'number' && limit > 0 ? sortedOffers.slice(0, limit) : sortedOffers;
    const first = trimmed[0];
    const route = {
        from: first.slices[0].origin,
        to: first.slices[0].destination,
        date: first.slices[0].departure_date,
        return_date: first.slices[1]?.departure_date,
    };
    const flights = trimmed.map((o) => {
        const outSeg = o.slices[0].segments[0];
        const retSeg = o.slices[1]?.segments[0];
        const allIn = computeAllInPrice(o.total_amount, o.total_currency);
        return {
            airline: outSeg.marketing_carrier_name,
            flight_number: outSeg.flight_number,
            price: formatMoneyFromCents(allIn.chargeAmountCents, allIn.currency),
            departure_time: extractHHMM(outSeg.departing_at),
            arrival_time: extractHHMM(outSeg.arriving_at),
            return_departure_time: retSeg ? extractHHMM(retSeg.departing_at) : undefined,
            return_arrival_time: retSeg ? extractHHMM(retSeg.arriving_at) : undefined,
        };
    });
    return formatFlightOptionsSMS(route, flights);
}
function stopsLabel(stops) {
    if (stops <= 0)
        return 'nonstop';
    return stops === 1 ? '1 stop' : `${stops} stops`;
}
/**
 * One leg's worth of options (departures OR returns) for the leg-by-leg flow.
 * Each block matches one preview card in the same order.
 */
export function legOptionsToSMS(header, options) {
    if (options.length === 0) {
        return 'no flights found for that leg. want me to try another day?';
    }
    const lines = options.map((o, i) => {
        const time = formatTime(extractHHMM(o.departing_at));
        return `${i + 1}. ${o.airline} ${time} (${stopsLabel(o.stops)}) — $${o.price}`;
    });
    return [header, '', ...lines, '', 'which one?'].join('\n');
}
/** Final pre-book summary: both legs with prices plus the firm combined total. */
export function tripSummaryToSMS(outbound, ret, formattedTotal) {
    const outTime = formatTime(extractHHMM(outbound.departing_at));
    const retTime = formatTime(extractHHMM(ret.departing_at));
    return [
        'your trip',
        '',
        `out: ${outbound.airline} · ${formatHumanDate(outbound.departure_date)} · ${outTime} — $${outbound.price}`,
        `back: ${ret.airline} · ${formatHumanDate(ret.departure_date)} · ${retTime} — $${ret.price}`,
        '',
        `total: ${formattedTotal}`,
        '',
        'reply HOLD or BOOK',
    ].join('\n');
}
