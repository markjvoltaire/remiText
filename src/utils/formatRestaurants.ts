import type { RestaurantVenue } from '../types.js';
import {
  compactTime,
  formatHumanDate,
  formatPartySize,
  formatPriceRange,
  formatSearchHeader,
} from './smsFormat.js';

const MAX_VENUES = 5;
const MAX_SLOTS_PREVIEW = 3;

function formatSlotTimes(slots: RestaurantVenue['slots'], limit: number): string {
  const seen = new Set<string>();
  const times: string[] = [];
  for (const slot of slots) {
    const t = slot.time?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    times.push(compactTime(t));
    if (times.length >= limit) break;
  }
  if (times.length === 0) return 'no times listed';
  return times.join(', ');
}

function venueDescriptor(venue: RestaurantVenue): { headline: string; subline?: string } {
  const price = formatPriceRange(venue.price_range);
  const details = [venue.cuisine?.trim(), venue.neighborhood?.trim()].filter(Boolean);
  const subline = details.length > 0 ? [...details, price].filter(Boolean).join(' · ') : undefined;

  if (subline) return { headline: venue.name, subline };
  if (price) return { headline: `${venue.name} · ${price}` };
  return { headline: venue.name };
}

function formatVenueBlock(venue: RestaurantVenue): string {
  const { headline, subline } = venueDescriptor(venue);
  const times = formatSlotTimes(venue.slots, MAX_SLOTS_PREVIEW);
  const extra =
    venue.slots.length > MAX_SLOTS_PREVIEW
      ? ` (+${venue.slots.length - MAX_SLOTS_PREVIEW} more)`
      : '';

  const lines = [headline];
  if (subline) lines.push(subline);
  lines.push(`${times}${extra}`);
  return lines.join('\n');
}

export function restaurantsToSMS(
  venues: RestaurantVenue[],
  meta: { location: string; date: string; partySize: number },
): string {
  const header = formatSearchHeader([
    meta.location,
    formatHumanDate(meta.date),
    formatPartySize(meta.partySize),
  ]);

  if (venues.length === 0) {
    return `${header}\n\nNothing open that night. Try another date or neighborhood?`;
  }

  const countLabel = venues.length === 1 ? '1 table open' : `${venues.length} tables open`;
  const blocks = venues.slice(0, MAX_VENUES).map(formatVenueBlock);

  return [formatSearchHeader([countLabel, header]), '', ...blocks, '', 'Which spot works?'].join('\n');
}

export function restaurantDetailToSMS(venue: RestaurantVenue): string {
  const { headline, subline } = venueDescriptor(venue);
  const lines = [headline];
  if (subline) lines.push(subline);
  lines.push('');

  if (venue.slots.length === 0) {
    lines.push('No open times right now.');
  } else {
    lines.push('Open times');
    for (const slot of venue.slots.slice(0, 15)) {
      const type =
        slot.slot_type && slot.slot_type !== 'Standard' ? ` · ${slot.slot_type}` : '';
      lines.push(compactTime(slot.time ?? '') + type);
    }
    if (venue.slots.length > 15) {
      lines.push(`+${venue.slots.length - 15} more`);
    }
  }

  lines.push('', 'Reply with a time to book.');
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
  const when = formatSearchHeader([
    formatHumanDate(params.date),
    compactTime(params.time),
    formatPartySize(params.partySize),
  ]);
  const seating =
    params.seatingType && params.seatingType !== 'Standard' ? ` · ${params.seatingType}` : '';
  const conf = params.confirmation ? `\nRef ${params.confirmation}` : '';
  return `Booked · ${params.venueName}\n${when}${seating}${conf}\n\nResy will email your confirmation.`;
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
    return 'No upcoming reservations on file.';
  }

  const blocks = items.map((r) => {
    const when = formatSearchHeader([
      formatHumanDate(r.date),
      r.time ? compactTime(r.time) : '',
      formatPartySize(r.party_size),
    ]);
    return `${r.venue_name}\n${when}`;
  });

  return ['Upcoming', '', ...blocks].join('\n');
}

export function formatReservationCancellationSMS(params: {
  venueName: string;
  date: string;
  time: string;
}): string {
  const when = formatSearchHeader([
    formatHumanDate(params.date),
    params.time ? compactTime(params.time) : '',
  ]);
  return `Cancelled · ${params.venueName}\n${when}`;
}
