import { normalizeReservationTimeLabel } from '../services/resy.js';
const CHILD_ID_PREFIX = /^p:(\d+)\/(.+)$/;
/** Spectrum / iMessage child part id, e.g. `p:2/ABC-DEF`. */
export function formatChildMessageId(partIndex, parentGuid) {
    return `p:${partIndex}/${parentGuid}`;
}
export function parseChildMessageId(messageId) {
    const match = messageId.match(CHILD_ID_PREFIX);
    if (!match)
        return null;
    return { partIndex: Number(match[1]), parentGuid: match[2] };
}
export function inferPreviewKind(user, partIndex) {
    if (user.last_restaurant_search?.venues?.[partIndex])
        return 'restaurant';
    if (user.last_flight_search?.offers?.[partIndex])
        return 'flight';
    return null;
}
export function buildPreviewReplyContext(user, kind, partIndex) {
    if (partIndex < 0)
        return null;
    if (kind === 'restaurant') {
        const venue = user.last_restaurant_search?.venues?.[partIndex];
        if (!venue)
            return null;
        const priceTag = venue.price_range ? '$'.repeat(Math.min(venue.price_range, 4)) : '';
        const ratingTag = venue.rating ? `rating ${venue.rating.toFixed(1)}` : '';
        const facts = [
            `name="${venue.name}"`,
            `venue_id=${venue.venue_id}`,
            venue.cuisine ? `cuisine="${venue.cuisine}"` : '',
            venue.neighborhood ? `neighborhood="${venue.neighborhood}"` : '',
            priceTag ? `price=${priceTag}` : '',
            ratingTag,
        ]
            .filter(Boolean)
            .join(', ');
        return [
            `The user replied to the image for restaurant option ${partIndex + 1} (${facts}).`,
            'Treat this as their selected restaurant. Do not ask which restaurant they mean.',
            'Default action for "tell me more", "more info", "what\'s it like", "story", "what to expect": write a SHORT 2-3 sentence brief in plain text — cuisine, vibe, neighborhood, and what diners can expect. End softly, e.g. "want to see times?".',
            'When describing the venue, you MAY use general knowledge for well-known restaurants. If you do NOT confidently know this specific venue, describe it factually using only the cuisine, neighborhood, price, and rating above — never invent specific dishes, chef names, awards, or history.',
            'Only call get_restaurant_availability when the user explicitly asks for times, availability, or says yes/sure to "Want to see times?".',
            'If they say book/reserve with a time (e.g. "book the 5:45"), call book_restaurant_table without confirm to send a confirmation SMS first — do not book until they reply yes.',
        ].join(' ');
    }
    const offer = user.last_flight_search?.offers?.[partIndex];
    if (!offer)
        return null;
    return [
        `The user replied to the image for flight option ${partIndex + 1}: ${offer.airline} ${offer.flight_number} (offer_id=${offer.offer_id}).`,
        'Treat this as their selected flight.',
        'If they want to proceed, restate the flight and ask HOLD or BOOK.',
        'Do not ask which flight they mean.',
    ].join(' ');
}
export function augmentUserMessageWithSelection(text, user, kind, partIndex) {
    const context = buildPreviewReplyContext(user, kind, partIndex);
    if (!context)
        return text;
    return `${text}\n\n[${context}]`;
}
export function augmentUserMessageWithReplyContext(text, user, preview, partIndex) {
    return augmentUserMessageWithSelection(text, user, preview.kind, partIndex);
}
/** Parse "book the 5:45" / "5:45 pm" into a slot label like "5:45 PM". */
export function parseTimeFromUserMessage(text) {
    const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match)
        return null;
    let hour = Number.parseInt(match[1], 10);
    const minute = match[2] ?? '00';
    let period = match[3]?.toUpperCase();
    if (!period) {
        period = hour >= 4 && hour <= 11 ? 'PM' : 'AM';
    }
    if (period === 'PM' && hour < 12)
        hour += 12;
    if (period === 'AM' && hour === 12)
        hour = 0;
    const outPeriod = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${minute} ${outPeriod}`;
}
function venueMentionedInText(venue, text) {
    const name = venue.name.trim().toLowerCase();
    if (!name)
        return false;
    const haystack = text.toLowerCase();
    if (haystack.includes(name))
        return true;
    const firstWord = name.split(/\s+/)[0];
    return Boolean(firstWord && firstWord.length > 3 && haystack.includes(firstWord));
}
function resolveVenueForBooking(user, text, history) {
    const ctx = user.last_restaurant_search;
    if (!ctx?.venues?.length)
        return null;
    if (ctx.selected_venue_id != null) {
        const selected = ctx.venues.find((v) => v.venue_id === ctx.selected_venue_id);
        if (selected)
            return selected;
    }
    if (ctx.venues.length === 1)
        return ctx.venues[0];
    for (const v of ctx.venues) {
        if (venueMentionedInText(v, text))
            return v;
    }
    for (let i = history.length - 1; i >= 0; i -= 1) {
        const msg = history[i];
        if (!msg)
            continue;
        for (const v of ctx.venues) {
            if (venueMentionedInText(v, msg.content))
                return v;
        }
    }
    return null;
}
/**
 * When the user says "book the 5:45" etc., force the agent to call book_restaurant_table
 * instead of claiming booking is unavailable.
 */
export function augmentBookRestaurantCommand(text, user, history) {
    if (!/\b(book|reserve|reservation)\b/i.test(text))
        return text;
    const ctx = user.last_restaurant_search;
    if (!ctx?.search_params?.date)
        return text;
    const time = parseTimeFromUserMessage(text) ?? normalizeReservationTimeLabel(text);
    if (!time)
        return text;
    const venue = resolveVenueForBooking(user, text, history);
    if (!venue) {
        return `${text}\n\n[Context: User wants to book a table at ${time} but no single restaurant is selected. Ask which restaurant from the latest search, or call get_restaurant_availability first.]`;
    }
    const { date, party_size: partySize } = ctx.search_params;
    return `${text}\n\n[Context: User wants to book ${venue.name} (venue_id=${venue.venue_id}) on ${date} for ${partySize} at ${time}. Call book_restaurant_table WITHOUT confirm (omit confirm or confirm=false) with venue_id=${venue.venue_id}, date=${date}, party_size=${partySize}, time="${time}". Use the tool's formatted field as your reply — do NOT book until they say yes. Restaurant booking IS available — never say coming soon or tell them to use the Resy app.]`;
}
const RESTAURANT_CONFIRM_YES = /^(yes|yep|yeah|y|sure|ok|okay|confirm|confirmed|do it|book it|go ahead|sounds good|let's do it|lets do it)\b/i;
const RESTAURANT_CONFIRM_NO = /^(no|nope|nah|not yet|wait|stop|cancel|nevermind|never mind)\b/i;
/** After a confirmation prompt, user said yes → book with confirm=true. */
export function augmentRestaurantBookingYes(text, user) {
    const pending = user.pending_restaurant_booking;
    if (!pending)
        return text;
    if (RESTAURANT_CONFIRM_NO.test(text.trim())) {
        return `${text}\n\n[Context: User declined the pending ${pending.venue_name} reservation. Do not call book_restaurant_table. Ask what they'd like instead.]`;
    }
    if (!RESTAURANT_CONFIRM_YES.test(text.trim()) && !/\b(yes|yep|yeah|sure|ok|confirm)\b/i.test(text)) {
        return text;
    }
    return `${text}\n\n[Context: User confirmed the pending reservation. Call book_restaurant_table with confirm=true, venue_id=${pending.venue_id}, date=${pending.date}, party_size=${pending.party_size}, time="${pending.time}".]`;
}
