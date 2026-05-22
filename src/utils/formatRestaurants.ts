import type { RestaurantVenue } from '../types.js';

const MAX_VENUES = 5;
const MAX_SLOTS_PREVIEW = 3;

function priceLabel(priceRange: number): string {
  if (!priceRange || priceRange < 1) return '';
  return ' ' + '$'.repeat(Math.min(priceRange, 4));
}

function formatSlotTimes(slots: RestaurantVenue['slots'], limit: number): string {
  const seen = new Set<string>();
  const times: string[] = [];
  for (const slot of slots) {
    const t = slot.time?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    times.push(t);
    if (times.length >= limit) break;
  }
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

export function formatReservationConfirmationSMS(params: {
  venueName: string;
  date: string;
  time: string;
  partySize: number;
  confirmation?: string;
  seatingType?: string;
}): string {
  const seating = params.seatingType && params.seatingType !== 'Standard' ? ` (${params.seatingType})` : '';
  const conf = params.confirmation ? ` Confirmation: ${params.confirmation}.` : '';
  return `Booked ${params.venueName} for ${params.partySize} on ${params.date} at ${params.time}${seating}.${conf} You'll get a Resy confirmation email shortly.`;
}

export function reservationsListToSMS(
  items: Array<{
    venue_name: string;
    date: string;
    time: string;
    party_size: number;
  }>,
): string {
  if (items.length === 0) {
    return 'No upcoming restaurant reservations on file.';
  }
  const lines = items.map((r, idx) => {
    const time = r.time ? ` at ${r.time}` : '';
    return `${idx + 1}. ${r.venue_name} — ${r.date}${time}, party of ${r.party_size}`;
  });
  return ['Your upcoming reservations:', '', ...lines].join('\n');
}

export function formatReservationCancellationSMS(params: {
  venueName: string;
  date: string;
  time: string;
}): string {
  const time = params.time ? ` at ${params.time}` : '';
  return `Cancelled your reservation at ${params.venueName} on ${params.date}${time}.`;
}
