import type {
  LastRestaurantSearchContext,
  PendingRestaurantBooking,
  PendingRestaurantSummary,
  RestaurantVenue,
} from '../types.js';

const CONTEXT_SLOT_LIMIT = 5;

export function summarizeVenuesForContext(venues: RestaurantVenue[]): PendingRestaurantSummary[] {
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

/** Compact shape for Claude tool results (no booking tokens). */
export function slimVenuesForTool(venues: RestaurantVenue[]) {
  return venues.map((v) => ({
    venue_id: v.venue_id,
    name: v.name,
    cuisine: v.cuisine,
    neighborhood: v.neighborhood,
    price_range: v.price_range,
    slots: v.slots.slice(0, 5).map((s) => ({ time: s.time, slot_type: s.slot_type })),
  }));
}

export function formatLastRestaurantSearchForPrompt(
  ctx: LastRestaurantSearchContext | null | undefined,
): string {
  if (!ctx?.venues?.length) return '';

  const { location, date, party_size, query } = ctx.search_params;
  const queryPart = query ? ` query="${query}"` : '';
  const selectedPart =
    ctx.selected_venue_id != null ? ` selected_venue_id=${ctx.selected_venue_id}` : '';

  const lines = ctx.venues.map((v, idx) => {
    const times = v.slots
      .map((s) => s.time)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
    return `${idx + 1}. venue_id=${v.venue_id} ${v.name}${v.neighborhood ? ` (${v.neighborhood})` : ''} — ${times || 'no times'}`;
  });

  return [
    `Prior restaurant search context (location="${location}", date=${date}, party_size=${party_size}${queryPart}${selectedPart}):`,
    ...lines,
    'USE THIS CONTEXT ONLY when the user is picking a venue from the list above (by name, position like "first/second", or by replying to a preview image).',
    'DO NOT reuse this list as a reply if the user is asking for a NEW search — for example a different cuisine, neighborhood, date, party size, or city. In that case you MUST call search_restaurants with the new parameters.',
    'NEVER relabel these venues as a different cuisine or different date than the parameters above. If the user asks for sushi and the cached list is not sushi, call search_restaurants again.',
    'If the user wants to book, call book_restaurant_table (without confirm) to send a confirmation SMS first. Only call with confirm=true after they reply yes.',
  ].join('\n');
}

export function formatPendingRestaurantBookingForPrompt(
  pending: PendingRestaurantBooking | null | undefined,
): string {
  if (!pending) return '';

  return [
    `Pending restaurant booking (awaiting user yes): ${pending.venue_name} (venue_id=${pending.venue_id}) on ${pending.date} at ${pending.time} for ${pending.party_size}.`,
    'If the user replies yes/yep/ok/sure/confirm, call book_restaurant_table with confirm=true and these exact parameters.',
    'If they say no/wait/cancel, do not book — ask what they want instead.',
    'If they request a different restaurant or time, call book_restaurant_table without confirm to stage a new confirmation.',
  ].join(' ');
}
