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
    return [
      `The user replied to the image for restaurant option ${partIndex + 1}: ${venue.name} (venue_id=${venue.venue_id}).`,
      'Treat this as their selected restaurant.',
      'If they ask for more info or times, call get_restaurant_availability for this venue_id.',
      'Do not ask which restaurant they mean.',
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
