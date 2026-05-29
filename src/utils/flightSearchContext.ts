import type {
  FlightOffer,
  FlightTripBuilder,
  LastFlightSearchContext,
  PendingFlightOfferSummary,
} from '../types.js';
import { computeAllInPrice } from './pricing.js';

function extractHHMM(isoDatetime: string): string {
  return isoDatetime.split('T')[1]?.slice(0, 5) ?? '00:00';
}

export function summarizeOffersForContext(offers: FlightOffer[]): PendingFlightOfferSummary[] {
  return offers.map((o) => {
    const out = o.slices[0]?.segments[0];
    const ret = o.slices[1]?.segments[0];
    const allIn = computeAllInPrice(o.total_amount, o.total_currency);
    return {
      offer_id: o.id,
      airline: out?.marketing_carrier_name ?? '',
      flight_number: out?.flight_number ?? '',
      price: Math.round(allIn.chargeAmountCents / 100),
      currency: o.total_currency,
      outbound_depart: extractHHMM(out?.departing_at ?? ''),
      outbound_arrive: extractHHMM(out?.arriving_at ?? ''),
      return_depart: ret ? extractHHMM(ret.departing_at) : undefined,
      return_arrive: ret ? extractHHMM(ret.arriving_at) : undefined,
    };
  });
}

export function formatLastSearchForPrompt(ctx: LastFlightSearchContext | null | undefined): string {
  if (!ctx?.offers?.length) return '';

  const lines = ctx.offers.map((o, idx) => {
    const ret =
      o.return_depart && o.return_arrive
        ? ` | return ${o.return_depart}-${o.return_arrive}`
        : '';
    return `${idx + 1}. offer_id=${o.offer_id} ${o.airline} ${o.flight_number} $${o.price} ${o.outbound_depart}-${o.outbound_arrive}${ret}`;
  });

  return [
    'Latest search — pending options (use these exact offer_id values for hold_flight):',
    ...lines,
    'If the user names an airline, flight number, or refers to an option by position in the list (first, second, third, etc.), pick the matching row.',
    'Do not ask for departure or return dates again if the user already gave them or if the options above already reflect those dates.',
  ].join('\n');
}

/** Active leg-by-leg round-trip builder — partial_offer_ids for select_*_flight tools. */
export function formatFlightTripBuilderForPrompt(
  builder: FlightTripBuilder | null | undefined,
): string {
  if (!builder) return '';

  const lines: string[] = [];
  if (builder.step === 'outbound' && builder.outbound_options.length > 0) {
    lines.push('Round-trip builder — pick DEPARTURE (use select_outbound_flight with partial_offer_id):');
    for (const [i, o] of builder.outbound_options.entries()) {
      lines.push(
        `${i + 1}. partial_offer_id=${o.partial_offer_id} ${o.airline} ${o.flight_number} $${o.price}`,
      );
    }
  } else if (builder.step === 'return' && builder.return_options?.length) {
    lines.push(
      `Round-trip builder — departure locked: ${builder.selected_outbound?.airline ?? 'selected'}. Pick RETURN (use select_return_flight with partial_offer_id):`,
    );
    for (const [i, o] of builder.return_options.entries()) {
      lines.push(
        `${i + 1}. partial_offer_id=${o.partial_offer_id} ${o.airline} ${o.flight_number} $${o.price}`,
      );
    }
  } else if (builder.step === 'ready_to_book' && builder.final_offer_id) {
    lines.push(
      `Round-trip ready to book — final_offer_id=${builder.final_offer_id} (use for hold_flight / book_flight).`,
    );
  }

  if (lines.length === 0) return '';
  return [
    ...lines,
    'Never invent partial_offer_id values — only use ids listed above.',
  ].join('\n');
}
