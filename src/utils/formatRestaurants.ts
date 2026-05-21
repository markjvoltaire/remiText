import type { RestaurantVenue } from '../types.js';

const MAX_VENUES = 5;
const MAX_SLOTS_PREVIEW = 3;

function priceLabel(priceRange: number): string {
  if (!priceRange || priceRange < 1) return '';
  return ' ' + '$'.repeat(Math.min(priceRange, 4));
}

function formatSlotTimes(slots: RestaurantVenue['slots'], limit: number): string {
  const times = slots
    .map((s) => s.time)
    .filter(Boolean)
    .slice(0, limit);
  if (times.length === 0) return 'no times';
  return times.join(', ');
}

export function restaurantsToSMS(
  venues: RestaurantVenue[],
  meta: { location: string; date: string; partySize: number },
): string {
  if (venues.length === 0) {
    return `No restaurants with availability near ${meta.location} on ${meta.date} for ${meta.partySize}.`;
  }

  const lines = venues.slice(0, MAX_VENUES).map((v, idx) => {
    const cuisine = v.cuisine ? ` ${v.cuisine}` : '';
    const neighborhood = v.neighborhood ? ` (${v.neighborhood})` : '';
    const price = priceLabel(v.price_range);
    const times = formatSlotTimes(v.slots, MAX_SLOTS_PREVIEW);
    const more =
      v.slots.length > MAX_SLOTS_PREVIEW ? ` +${v.slots.length - MAX_SLOTS_PREVIEW} more` : '';
    return `${idx + 1}. ${v.name}${cuisine}${price}${neighborhood} — ${times}${more}`;
  });

  return [
    `${venues.length} spot(s) near ${meta.location} on ${meta.date} for ${meta.partySize}:`,
    '',
    ...lines,
  ].join('\n');
}

export function restaurantDetailToSMS(venue: RestaurantVenue): string {
  const cuisine = venue.cuisine ? `${venue.cuisine}` : '';
  const price = priceLabel(venue.price_range).trim();
  const meta = [cuisine, price, venue.neighborhood].filter(Boolean).join(' · ');

  const lines = [`${venue.name}${meta ? ` — ${meta}` : ''}`, ''];

  if (venue.slots.length === 0) {
    lines.push('No available times.');
  } else {
    lines.push(`Available (${venue.slots.length}):`);
    for (const slot of venue.slots.slice(0, 15)) {
      const type = slot.slot_type && slot.slot_type !== 'Standard' ? ` (${slot.slot_type})` : '';
      lines.push(`- ${slot.time}${type}`);
    }
    if (venue.slots.length > 15) {
      lines.push(`... and ${venue.slots.length - 15} more`);
    }
  }

  return lines.join('\n');
}
