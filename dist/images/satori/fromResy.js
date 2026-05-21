function priceRangeLabel(priceRange) {
    if (!priceRange || priceRange < 1)
        return undefined;
    return '$'.repeat(Math.min(priceRange, 4));
}
function ratingLabel(rating) {
    if (rating == null || Number.isNaN(rating))
        return undefined;
    return `${rating.toFixed(1)}★`;
}
export function restaurantCardInputFromVenue(venue, meta) {
    return {
        name: venue.name,
        imageUrl: venue.image_url,
        cuisine: venue.cuisine || undefined,
        neighborhood: venue.neighborhood || undefined,
        priceRange: priceRangeLabel(venue.price_range),
        rating: ratingLabel(venue.rating),
        date: meta.date,
        partySize: meta.partySize,
        times: venue.slots.map((s) => s.time).filter(Boolean),
        optionLabel: meta.optionLabel,
    };
}
