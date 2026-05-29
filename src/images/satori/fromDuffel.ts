import type { FlightLeg, FlightOffer, HeldOrder } from '../../types.js';
import type { FlightCardInput } from './templates/FlightCard.js';

function formatHHMM(iso: string | undefined): string {
  if (!iso) return '';
  const time = iso.split('T')[1]?.slice(0, 5);
  if (!time) return '';
  const [hStr, m] = time.split(':');
  const hour = Number.parseInt(hStr ?? '0', 10);
  if (Number.isNaN(hour)) return time;
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${suffix}`;
}

function durationBetween(start?: string, end?: string): string {
  if (!start || !end) return '';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatDisplayDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  const month = date.toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return `${month} ${day}, ${year}`;
}

/**
 * Build a `FlightCardInput` from a Duffel-derived `HeldOrder`, using the
 * outbound slice as the canonical "trip" the card represents. Pricing must
 * be passed in already-formatted (e.g. "$248") to match what we tell the
 * user over SMS — we never recompute markup here.
 */
export function flightCardInputFromHeldOrder(
  order: HeldOrder,
  formattedPrice: string,
): FlightCardInput | null {
  const slice = order.slices[0];
  if (!slice) return null;
  const segments = slice.segments;
  if (segments.length === 0) return null;

  const first = segments[0]!;
  const last = segments[segments.length - 1]!;

  return {
    airline: first.marketing_carrier_name,
    logoUrl: first.marketing_carrier_logo_lockup_url,
    origin: slice.origin || first.origin.iata_code,
    destination: slice.destination || last.destination.iata_code,
    departureTime: formatHHMM(first.departing_at),
    arrivalTime: formatHHMM(last.arriving_at),
    price: formattedPrice,
    duration: durationBetween(first.departing_at, last.arriving_at),
    stops: Math.max(0, segments.length - 1),
    date: formatDisplayDate(slice.departure_date),
    cabinClass: 'Economy',
    flightNumber: first.flight_number,
  };
}

/**
 * Build a `FlightCardInput` from a single leg (partial offer) in the
 * leg-by-leg flow. Shows that leg's indicative price; the firm total comes
 * later from the combined fare.
 */
export function flightCardInputFromLeg(
  leg: FlightLeg,
  formattedPrice: string,
): FlightCardInput {
  return {
    airline: leg.airline,
    logoUrl: leg.marketing_carrier_logo_lockup_url,
    origin: leg.origin,
    destination: leg.destination,
    departureTime: formatHHMM(leg.departing_at),
    arrivalTime: formatHHMM(leg.arriving_at),
    price: formattedPrice,
    duration: durationBetween(leg.departing_at, leg.arriving_at),
    stops: leg.stops,
    date: formatDisplayDate(leg.departure_date),
    cabinClass: 'Economy',
    flightNumber: leg.flight_number,
  };
}

/**
 * Build a `FlightCardInput` from a search-result `FlightOffer`. The outbound
 * slice is used as the canonical leg, which matches how `offersToSMS` renders
 * the option list (one line per offer keyed off slice[0]).
 */
export function flightCardInputFromOffer(
  offer: FlightOffer,
  formattedPrice: string,
): FlightCardInput | null {
  const slice = offer.slices[0];
  if (!slice) return null;
  const segments = slice.segments;
  if (segments.length === 0) return null;

  const first = segments[0]!;
  const last = segments[segments.length - 1]!;

  return {
    airline: first.marketing_carrier_name,
    logoUrl: first.marketing_carrier_logo_lockup_url,
    origin: slice.origin || first.origin.iata_code,
    destination: slice.destination || last.destination.iata_code,
    departureTime: formatHHMM(first.departing_at),
    arrivalTime: formatHHMM(last.arriving_at),
    price: formattedPrice,
    duration: durationBetween(first.departing_at, last.arriving_at),
    stops: Math.max(0, segments.length - 1),
    date: formatDisplayDate(slice.departure_date),
    cabinClass: 'Economy',
    flightNumber: first.flight_number,
  };
}
