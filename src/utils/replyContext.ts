import type {
  ConversationMessage,
  FlightLegSummary,
  LastSentPreviewCards,
  PendingRestaurantSummary,
  UserProfile,
} from '../types.js';
import { normalizeReservationTimeLabel } from '../services/resy.js';

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
  const builder = user.flight_trip_builder;
  if (builder) {
    if (builder.step === 'outbound' && builder.outbound_options?.[partIndex]) {
      return 'flight_outbound';
    }
    if (builder.step === 'return' && builder.return_options?.[partIndex]) {
      return 'flight_return';
    }
  }
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
      'Default action for "tell me more", "more info", "what\'s it like", "story", "what to expect": write a SHORT 2-3 sentence brief in plain text — cuisine, vibe, neighborhood, and what diners can expect. End softly, e.g. "want to see times?".',
      'When describing the venue, you MAY use general knowledge for well-known restaurants. If you do NOT confidently know this specific venue, describe it factually using only the cuisine, neighborhood, price, and rating above — never invent specific dishes, chef names, awards, or history.',
      'Only call get_restaurant_availability when the user explicitly asks for times, availability, or says yes/sure to "Want to see times?".',
      'If they say book/reserve with a time (e.g. "book the 5:45"), call book_restaurant_table without confirm to send a confirmation SMS first — do not book until they reply yes.',
    ].join(' ');
  }

  if (kind === 'flight_outbound' || kind === 'flight_return') {
    const builder = user.flight_trip_builder;
    const options =
      kind === 'flight_outbound' ? builder?.outbound_options : builder?.return_options;
    const opt = options?.[partIndex];
    if (!opt) return null;
    const tool = kind === 'flight_outbound' ? 'select_outbound_flight' : 'select_return_flight';
    const legWord = kind === 'flight_outbound' ? 'departure' : 'return';
    return [
      `The user replied to the image for ${legWord} option ${partIndex + 1}: ${opt.airline} ${opt.flight_number} (partial_offer_id=${opt.partial_offer_id}).`,
      `Treat this as their selected ${legWord} flight. Call ${tool} with partial_offer_id="${opt.partial_offer_id}".`,
      'Do not ask which flight they mean and do not skip the tool call.',
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

/** Parse "book the 5:45" / "5:45 pm" into a slot label like "5:45 PM". */
export function parseTimeFromUserMessage(text: string): string | null {
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  const matchIndex = match.index ?? 0;
  const afterMatch = text.slice(matchIndex + match[0].length);
  // Reject day-of-month ordinals ("24th", "27th") mistaken for clock times.
  if (!match[2] && !match[3] && /^\s*(?:st|nd|rd|th)\b/i.test(afterMatch)) {
    return null;
  }

  let hour = Number.parseInt(match[1]!, 10);
  const minute = match[2] ?? '00';
  let period = match[3]?.toUpperCase() as 'AM' | 'PM' | undefined;

  if (!period) {
    period = hour >= 4 && hour <= 11 ? 'PM' : 'AM';
  }

  if (period === 'PM' && hour < 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;

  const outPeriod = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${minute} ${outPeriod}`;
}

function venueMentionedInText(venue: PendingRestaurantSummary, text: string): boolean {
  const name = venue.name.trim().toLowerCase();
  if (!name) return false;
  const haystack = text.toLowerCase();
  if (haystack.includes(name)) return true;
  const firstWord = name.split(/\s+/)[0];
  return Boolean(firstWord && firstWord.length > 3 && haystack.includes(firstWord));
}

function resolveVenueForBooking(
  user: UserProfile,
  text: string,
  history: ConversationMessage[],
): PendingRestaurantSummary | null {
  const ctx = user.last_restaurant_search;
  if (!ctx?.venues?.length) return null;

  if (ctx.selected_venue_id != null) {
    const selected = ctx.venues.find((v) => v.venue_id === ctx.selected_venue_id);
    if (selected) return selected;
  }

  if (ctx.venues.length === 1) return ctx.venues[0]!;

  for (const v of ctx.venues) {
    if (venueMentionedInText(v, text)) return v;
  }

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (!msg) continue;
    for (const v of ctx.venues) {
      if (venueMentionedInText(v, msg.content)) return v;
    }
  }

  return null;
}

/**
 * Resolve a venue from the CURRENT message only (named venue, explicit
 * selection, or a sole option). Unlike resolveVenueForBooking this never falls
 * back to history, so it is safe to use for implicit selections like
 * "Claudie at 9:30" where no booking verb is present.
 */
function resolveVenueFromSelection(
  user: UserProfile,
  text: string,
): PendingRestaurantSummary | null {
  const ctx = user.last_restaurant_search;
  if (!ctx?.venues?.length) return null;

  for (const v of ctx.venues) {
    if (venueMentionedInText(v, text)) return v;
  }

  if (ctx.selected_venue_id != null) {
    const selected = ctx.venues.find((v) => v.venue_id === ctx.selected_venue_id);
    if (selected) return selected;
  }

  if (ctx.venues.length === 1) return ctx.venues[0]!;

  return null;
}

function stageBookingContext(
  text: string,
  venue: PendingRestaurantSummary,
  date: string,
  partySize: number,
  time: string,
): string {
  return `${text}\n\n[Context: User wants to book ${venue.name} (venue_id=${venue.venue_id}) on ${date} for ${partySize} at ${time}. Call book_restaurant_table WITHOUT confirm (omit confirm or confirm=false) with venue_id=${venue.venue_id}, date=${date}, party_size=${partySize}, time="${time}". This staging tool call is REQUIRED — do NOT write a "just to confirm" message yourself; use the tool's formatted field as your reply, and do NOT book until they say yes. Restaurant booking IS available — never say coming soon or tell them to use the Resy app.]`;
}

/**
 * Force the agent to call book_restaurant_table (staging) instead of inventing a
 * confirmation message or claiming booking is unavailable. Triggers on two cases:
 *   1. Explicit verb + time: "book the 5:45", "reserve Carbone at 7".
 *   2. Implicit selection + time: "Claudie at 9:30", "the second one at 8" — a
 *      venue (or sole/selected option) plus a time, even with no booking verb.
 */
function looksLikeFlightMessage(text: string): boolean {
  return (
    /\b(flight|flights|fly|flying|airfare)\b/i.test(text) ||
    /\bfrom\s+.+\s+to\s+/i.test(text) ||
    /\b(one[- ]way|round[- ]?trip)\b/i.test(text) ||
    /\b[A-Z]{3}\s*(→|->|to)\s*[A-Z]{3}\b/.test(text) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\w*\s+\d{1,2}/i.test(
      text,
    )
  );
}

export function augmentBookRestaurantCommand(
  text: string,
  user: UserProfile,
  history: ConversationMessage[],
): string {
  const builder = user.flight_trip_builder;
  if (builder?.step === 'outbound' || builder?.step === 'return') return text;
  if (looksLikeFlightMessage(text)) return text;

  const ctx = user.last_restaurant_search;
  if (!ctx?.search_params?.date) return text;

  const time = parseTimeFromUserMessage(text) ?? normalizeReservationTimeLabel(text);
  if (!time) return text;

  const { date, party_size: partySize } = ctx.search_params;
  const hasBookVerb = /\b(book|reserve|reservation)\b/i.test(text);

  if (hasBookVerb) {
    const venue = resolveVenueForBooking(user, text, history);
    if (!venue) {
      return `${text}\n\n[Context: User wants to book a table at ${time} but no single restaurant is selected. Ask which restaurant from the latest search, or call get_restaurant_availability first.]`;
    }
    return stageBookingContext(text, venue, date, partySize, time);
  }

  // Implicit selection (no booking verb): require the venue name in this message.
  // Do not use sole-venue / selected-venue shortcuts — those misfire on unrelated texts
  // that happen to contain a parseable time (e.g. flight date ranges).
  for (const v of ctx.venues) {
    if (venueMentionedInText(v, text)) {
      return stageBookingContext(text, v, date, partySize, time);
    }
  }

  return text;
}

const RESTAURANT_CONFIRM_YES =
  /^(yes|yep|yeah|y|sure|ok|okay|confirm|confirmed|do it|book it|go ahead|sounds good|let's do it|lets do it)\b/i;

const RESTAURANT_CONFIRM_NO =
  /^(no|nope|nah|not yet|wait|stop|cancel|nevermind|never mind)\b/i;

/** After a confirmation prompt, user said yes → book with confirm=true. */
export function augmentRestaurantBookingYes(
  text: string,
  user: UserProfile,
): string {
  const trip = user.flight_trip_builder;
  if (trip?.step === 'outbound' || trip?.step === 'return') return text;

  const pending = user.pending_restaurant_booking;
  if (!pending) return text;
  if (RESTAURANT_CONFIRM_NO.test(text.trim())) {
    return `${text}\n\n[Context: User declined the pending ${pending.venue_name} reservation. Do not call book_restaurant_table. Ask what they'd like instead.]`;
  }
  if (!RESTAURANT_CONFIRM_YES.test(text.trim()) && !/\b(yes|yep|yeah|sure|ok|confirm)\b/i.test(text)) {
    return text;
  }

  return `${text}\n\n[Context: User confirmed the pending reservation. Call book_restaurant_table with confirm=true, venue_id=${pending.venue_id}, date=${pending.date}, party_size=${pending.party_size}, time="${pending.time}".]`;
}

const LEG_ORDINALS: Record<string, number> = {
  first: 0,
  '1st': 0,
  second: 1,
  '2nd': 1,
  third: 2,
  '3rd': 2,
  fourth: 3,
  '4th': 3,
  fifth: 4,
  '5th': 4,
};

/** ISO departure -> "h:mm AM/PM" matching parseTimeFromUserMessage output. */
function isoToTimeLabel(iso: string): string | null {
  const clock = iso.split('T')[1]?.slice(0, 5);
  if (!clock) return null;
  const [hStr, minute] = clock.split(':');
  const hour = Number.parseInt(hStr ?? '', 10);
  if (Number.isNaN(hour)) return null;
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${minute} ${period}`;
}

const GENERIC_AIRLINE_WORDS = new Set([
  'air',
  'airline',
  'airlines',
  'airways',
  'lines',
  'express',
  'international',
]);

function airlineMentionedInText(leg: FlightLegSummary, text: string): boolean {
  const haystack = text.toLowerCase();
  const airline = leg.airline.trim().toLowerCase();
  if (!airline) return false;
  if (haystack.includes(airline)) return true;

  const tokens = airline
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !GENERIC_AIRLINE_WORDS.has(w));
  return tokens.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack));
}

const FLIGHT_LEG_AFFIRMATIVE =
  /^(yes|yep|yeah|y|sure|ok|okay|that one|that works|sounds good|go ahead)\b/i;

/**
 * Resolve which leg the user picked from the current options, using (in order):
 * "cheapest"/"lowest" -> the first (cheapest-sorted) option; an explicit ordinal
 * or number ("first", "2nd", "option 3", "2"); a unique airline-name mention; or
 * a unique departure-time match. Returns null when the choice is ambiguous.
 */
function resolveLegFromText(
  options: FlightLegSummary[],
  text: string,
): FlightLegSummary | null {
  const lower = text.toLowerCase().trim();

  if (/\b(cheapest|lowest|least expensive)\b/.test(lower)) return options[0] ?? null;

  for (const [word, idx] of Object.entries(LEG_ORDINALS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower) && options[idx]) return options[idx]!;
  }

  const numMatch = lower.match(/(?:option|number|#|^)\s*(\d)\b/);
  if (numMatch) {
    const idx = Number.parseInt(numMatch[1]!, 10) - 1;
    if (idx >= 0 && options[idx]) return options[idx]!;
  }

  const airlineMatches = options.filter((o) => airlineMentionedInText(o, text));
  if (airlineMatches.length === 1) return airlineMatches[0]!;

  const wanted = parseTimeFromUserMessage(text);
  if (wanted) {
    const timeMatches = options.filter((o) => isoToTimeLabel(o.departing_at) === wanted);
    if (timeMatches.length === 1) return timeMatches[0]!;
  }

  return null;
}

/** Match "yes" / "ok" to the flight Remi just asked about in the prior assistant turn. */
function resolveLegFromAssistantConfirmation(
  options: FlightLegSummary[],
  history: ConversationMessage[],
): FlightLegSummary | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (!msg || msg.role !== 'assistant') continue;
    const matches = options.filter((o) => airlineMentionedInText(o, msg.content));
    if (matches.length === 1) return matches[0]!;
    return null;
  }
  return null;
}

function stageFlightLegContext(
  text: string,
  kind: 'flight_outbound' | 'flight_return',
  option: FlightLegSummary,
): string {
  const tool = kind === 'flight_outbound' ? 'select_outbound_flight' : 'select_return_flight';
  const legWord = kind === 'flight_outbound' ? 'departure' : 'return';
  return `${text}\n\n[Context: User selected the ${legWord} flight ${option.airline} ${option.flight_number} (partial_offer_id=${option.partial_offer_id}). Call ${tool} with partial_offer_id="${option.partial_offer_id}". This tool call is REQUIRED — do NOT skip it, do NOT invent a summary, and do NOT show return flights or a final total yourself; use the tool's formatted field as your reply.]`;
}

/**
 * Force the agent to call select_outbound_flight / select_return_flight (same
 * class of guardrail as augmentBookRestaurantCommand) when the user picks a leg
 * by position, airline, or time during an active round-trip build. No-op once
 * the trip is ready_to_book.
 */
export function augmentFlightLegSelection(
  text: string,
  user: UserProfile,
  history: ConversationMessage[] = [],
): string {
  const builder = user.flight_trip_builder;
  if (!builder) return text;

  let kind: 'flight_outbound' | 'flight_return';
  let options: FlightLegSummary[] | undefined;
  if (builder.step === 'outbound') {
    kind = 'flight_outbound';
    options = builder.outbound_options;
  } else if (builder.step === 'return') {
    kind = 'flight_return';
    options = builder.return_options;
  } else {
    return text;
  }

  if (!options?.length) return text;

  let chosen = resolveLegFromText(options, text);
  if (!chosen && FLIGHT_LEG_AFFIRMATIVE.test(text.trim())) {
    chosen = resolveLegFromAssistantConfirmation(options, history);
  }
  if (!chosen) return text;

  return stageFlightLegContext(text, kind, chosen);
}
