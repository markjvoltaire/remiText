import type { LastSentPreviewCards, UserProfile } from '../types.js';

const CHILD_ID_PREFIX = /^p:(\d+)\/(.+)$/;

export type PreviewSelectionKind = LastSentPreviewCards['kind'];

/** Spectrum / iMessage child part id, e.g. `p:2/ABC-DEF`. */
export function formatChildMessageId(partIndex: number, parentGuid: string): string {
  return `p:${partIndex}/${parentGuid}`;
}

export function parseChildMessageId(messageId: string): { partIndex: number; parentGuid: string } | null {
  const match = messageId.match(CHILD_ID_PREFIX);
  if (!match) return null;
  return { partIndex: Number(match[1]), parentGuid: match[2]! };
}

export function inferPreviewKind(user: UserProfile, partIndex: number): PreviewSelectionKind | null {
  if (user.last_restaurant_search?.venues?.[partIndex]) return 'restaurant';
  if (user.last_flight_search?.offers?.[partIndex]) return 'flight';
  return null;
}

export function buildPreviewReplyContext(
  user: UserProfile,
  kind: PreviewSelectionKind,
  partIndex: number,
): string | null {
  if (partIndex < 0) return null;

  if (kind === 'restaurant') {
    const venue = user.last_restaurant_search?.venues?.[partIndex];
    if (!venue) return null;

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
      'Default action for "tell me more", "more info", "what\'s it like", "story", "what to expect": write a SHORT 2-3 sentence brief in plain text — cuisine, vibe, neighborhood, and what diners can expect. End with one short follow-up question like "Want to see times?".',
      'When describing the venue, you MAY use general knowledge for well-known restaurants. If you do NOT confidently know this specific venue, describe it factually using only the cuisine, neighborhood, price, and rating above — never invent specific dishes, chef names, awards, or history.',
      'Only call get_restaurant_availability when the user explicitly asks for times, availability, or says yes/sure to "Want to see times?".',
      'If they want to book/reserve after picking a time, restate venue + time and ask "Book it?" — on yes call book_restaurant_table.',
    ].join(' ');
  }

  const offer = user.last_flight_search?.offers?.[partIndex];
  if (!offer) return null;
  return [
    `The user replied to the image for flight option ${partIndex + 1}: ${offer.airline} ${offer.flight_number} (offer_id=${offer.offer_id}).`,
    'Treat this as their selected flight.',
    'If they want to proceed, restate the flight and ask HOLD or BOOK.',
    'Do not ask which flight they mean.',
  ].join(' ');
}

export function augmentUserMessageWithSelection(
  text: string,
  user: UserProfile,
  kind: PreviewSelectionKind,
  partIndex: number,
): string {
  const context = buildPreviewReplyContext(user, kind, partIndex);
  if (!context) return text;
  return `${text}\n\n[${context}]`;
}

export function augmentUserMessageWithReplyContext(
  text: string,
  user: UserProfile,
  preview: LastSentPreviewCards,
  partIndex: number,
): string {
  return augmentUserMessageWithSelection(text, user, preview.kind, partIndex);
}
