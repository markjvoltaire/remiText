const CONTEXT_SLOT_LIMIT = 5;
export function summarizeVenuesForContext(venues) {
    return venues.map((v) => ({
        venue_id: v.venue_id,
        name: v.name,
        cuisine: v.cuisine,
        neighborhood: v.neighborhood,
        price_range: v.price_range,
        rating: v.rating,
        slots: v.slots.slice(0, CONTEXT_SLOT_LIMIT).map((s) => ({
            time: s.time,
            slot_type: s.slot_type,
            config_token: s.config_token,
        })),
    }));
}
export function formatLastRestaurantSearchForPrompt(ctx) {
    if (!ctx?.venues?.length)
        return '';
    const { location, date, party_size, query } = ctx.search_params;
    const queryPart = query ? ` query="${query}"` : '';
    const lines = ctx.venues.map((v, idx) => {
        const times = v.slots
            .map((s) => s.time)
            .filter(Boolean)
            .slice(0, 3)
            .join(', ');
        return `${idx + 1}. venue_id=${v.venue_id} ${v.name}${v.neighborhood ? ` (${v.neighborhood})` : ''} — ${times || 'no times'}`;
    });
    return [
        `Latest restaurant search near ${location} on ${date} for ${party_size}${queryPart}:`,
        ...lines,
        'If the user names a restaurant or refers to an option by position (first, second, etc.), pick the matching venue_id for get_restaurant_availability.',
        'Do not ask for date or party size again if the user already gave them or if the options above already reflect those.',
        'If the user asks to book or reserve a table, tell them Remi can show availability today and full booking is coming soon — do not attempt to book.',
    ].join('\n');
}
