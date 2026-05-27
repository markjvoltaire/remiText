import { compactTime, formatBookingDate, formatHumanDate, formatPartySize, } from './smsFormat.js';
import { formatCuratedTimesPhrase, mealPeriodLabel, } from './restaurantTimeFilter.js';
const MAX_VENUES = 4;
const MAX_CURATED_TIMES = 3;
function whenPhrase(date, mealPeriod) {
    const day = formatHumanDate(date);
    if (!mealPeriod)
        return day;
    const label = mealPeriodLabel(mealPeriod);
    if (mealPeriod === 'night' || mealPeriod === 'dinner' || mealPeriod === 'late_night') {
        return `${day} ${label}`;
    }
    return `${label} ${day}`;
}
export function restaurantsToSMS(venues, meta) {
    const when = whenPhrase(meta.date, meta.mealPeriod);
    if (venues.length === 0) {
        const periodHint = meta.mealPeriod ? ` for ${mealPeriodLabel(meta.mealPeriod)}` : '';
        return `nothing open${periodHint} that night. want me to try another time or spot?`;
    }
    if (venues.length === 1) {
        const venue = venues[0];
        const times = formatCuratedTimesPhrase(venue.slots, MAX_CURATED_TIMES, meta.mealPeriod);
        const lines = [`${venue.name} has good availability ${when}.`];
        if (times)
            lines.push(`${times} work.`);
        lines.push('want me to lock one in?');
        return lines.join('\n');
    }
    const lines = [`found a few solid options ${when}.`, ''];
    for (const venue of venues.slice(0, MAX_VENUES)) {
        const times = formatCuratedTimesPhrase(venue.slots, MAX_CURATED_TIMES, meta.mealPeriod);
        lines.push(times ? `${venue.name} — ${times}` : venue.name);
    }
    lines.push('', 'want me to lock one in?');
    return lines.join('\n');
}
export function restaurantDetailToSMS(venue, mealPeriod) {
    if (venue.slots.length === 0) {
        return `nothing open at ${venue.name} right now. want me to check another night?`;
    }
    const times = formatCuratedTimesPhrase(venue.slots, MAX_CURATED_TIMES, mealPeriod);
    const lines = [`${venue.name} looks good.`];
    if (times)
        lines.push(`${times} work.`);
    lines.push('want me to lock one in?');
    return lines.join('\n');
}
export function formatRestaurantBookingConfirmPromptSMS(params) {
    const day = formatBookingDate(params.date);
    const time = compactTime(params.time);
    const party = params.partySize === 1 ? 'just you' : `for ${params.partySize}`;
    const lines = [`just to confirm — ${params.venueName}, ${time} ${day}, ${party}?`];
    if (params.address?.trim())
        lines.push(params.address.trim());
    lines.push('', "reply yes and i'll lock it in.");
    return lines.join('\n');
}
export function formatReservationConfirmationSMS(params) {
    const day = formatHumanDate(params.date);
    const time = compactTime(params.time);
    const lines = [`done. you're in at ${params.venueName} — ${time} ${day}.`];
    if (params.address?.trim())
        lines.push(params.address.trim());
    return lines.join('\n');
}
export function reservationsListToSMS(items) {
    if (items.length === 0) {
        return 'no upcoming reservations on file.';
    }
    const lines = ['upcoming:', ''];
    for (const r of items) {
        const day = formatHumanDate(r.date);
        const time = r.time ? compactTime(r.time) : '';
        const party = formatPartySize(r.party_size);
        lines.push(`${r.venue_name} — ${day}${time ? ` ${time}` : ''} ${party}`);
    }
    return lines.join('\n');
}
export function formatReservationCancellationSMS(params) {
    const day = formatHumanDate(params.date);
    const time = params.time ? compactTime(params.time) : '';
    return `cancelled ${params.venueName}${time ? ` ${time}` : ''} ${day}.`;
}
