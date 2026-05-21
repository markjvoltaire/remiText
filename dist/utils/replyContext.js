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
export function buildPreviewReplyContext(user, preview, partIndex) {
    if (partIndex < 0 || partIndex >= preview.optionCount)
        return null;
    if (preview.kind === 'restaurant') {
        const venue = user.last_restaurant_search?.venues?.[partIndex];
        if (!venue)
            return null;
        return [
            `The user replied to the image for restaurant option ${partIndex + 1}: ${venue.name} (venue_id=${venue.venue_id}).`,
            'Treat this as their selected restaurant.',
            'If they ask for more info or times, call get_restaurant_availability for this venue_id.',
            'Do not ask which restaurant they mean.',
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
export function augmentUserMessageWithReplyContext(text, user, preview, partIndex) {
    const context = buildPreviewReplyContext(user, preview, partIndex);
    if (!context)
        return text;
    return `${text}\n\n[${context}]`;
}
