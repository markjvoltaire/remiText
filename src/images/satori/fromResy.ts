import type { RestaurantVenue } from '../../types.js';
import type { RestaurantCardInput } from './templates/RestaurantCard.js';

function priceRangeLabel(priceRange: number): string | undefined {
  if (!priceRange || priceRange < 1) return undefined;
  return '$'.repeat(Math.min(priceRange, 4));
}

function ratingLabel(rating?: number): string | undefined {
  if (rating == null || Number.isNaN(rating)) return undefined;
  return `${rating.toFixed(1)}★`;
}

export function restaurantCardInputFromVenue(
  venue: RestaurantVenue,
  meta: { date: string; partySize: number; optionLabel?: string },
): RestaurantCardInput {
  return {
    name: venue.name,
    imageUrl: venue.image_url,
    cuisine: venue.cuisine || undefined,
    neighborhood: venue.neighborhood || undefined,
    priceRange: priceRangeLabel(venue.price_range),
    rating: ratingLabel(venue.rating),
    date: meta.date,
    partySize: meta.partySize,
    times: venue.slots.map((s: { time: string }) => s.time).filter(Boolean),
    optionLabel: meta.optionLabel,
  };
}
