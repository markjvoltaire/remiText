export interface PendingFlightOfferSummary {
  offer_id: string;
  airline: string;
  flight_number: string;
  price: number;
  currency: string;
  outbound_depart: string;
  outbound_arrive: string;
  return_depart?: string;
  return_arrive?: string;
}

/** Saved when running search_flights so we can refresh stale Duffel offers. */
export interface LastFlightSearchParams {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
}

export interface LastFlightSearchContext {
  offers: PendingFlightOfferSummary[];
  updated_at: string;
  search_params?: LastFlightSearchParams;
  /** Full `data` object from Duffel POST /air/offer_requests (same shape as API JSON). */
  duffel_raw_offer_request?: Record<string, unknown>;
}

/**
 * A single bookable leg from Duffel's multi-step (partial offer) search.
 * Each partial offer has exactly one slice; `partial_offer_id` is combined
 * with the other leg's id via getFaresById to produce a bookable offer.
 */
export interface FlightLeg {
  partial_offer_id: string;
  origin: string;
  destination: string;
  departure_date: string;
  airline: string;
  marketing_carrier_logo_lockup_url?: string;
  flight_number: string;
  departing_at: string;
  arriving_at: string;
  stops: number;
  /** Raw Duffel amount for this partial offer (indicative until combined fare). */
  amount: string;
  currency: string;
}

/** Slim leg shape stored on the user record for the trip builder state. */
export interface FlightLegSummary {
  partial_offer_id: string;
  origin: string;
  destination: string;
  departure_date: string;
  airline: string;
  flight_number: string;
  departing_at: string;
  arriving_at: string;
  stops: number;
  /** All-in price in whole currency units (already includes Remi markup). */
  price: number;
  currency: string;
}

export interface FlightTripBuilderParams {
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  cabin_class?: 'economy' | 'premium_economy' | 'business' | 'first';
  adult_count?: number;
}

/**
 * State machine for leg-by-leg round-trip booking. Persisted on the user while
 * they pick a departure, then a return, before a final combined-fare summary.
 */
export interface FlightTripBuilder {
  partial_offer_request_id: string;
  step: 'outbound' | 'return' | 'ready_to_book';
  search_params: FlightTripBuilderParams;
  outbound_options: FlightLegSummary[];
  selected_outbound?: FlightLegSummary;
  return_options?: FlightLegSummary[];
  selected_return?: FlightLegSummary;
  /** Bookable offer id from getFaresById once both legs are chosen. */
  final_offer_id?: string;
  total_amount?: string;
  currency?: string;
  updated_at: string;
}

export interface RestaurantSlotSummary {
  time: string;
  slot_type: string;
  config_token: string;
}

export interface RestaurantVenue {
  venue_id: number;
  name: string;
  cuisine: string;
  neighborhood: string;
  /** Street address from Resy when available */
  address?: string;
  price_range: number;
  rating?: number;
  image_url?: string;
  slots: RestaurantSlotSummary[];
}

export interface PendingRestaurantSummary {
  venue_id: number;
  name: string;
  cuisine: string;
  neighborhood: string;
  price_range: number;
  rating?: number;
  slots: RestaurantSlotSummary[];
}

export interface LastRestaurantSearchParams {
  location: string;
  date: string;
  party_size: number;
  query?: string;
  /** dinner, night, lunch, etc. — filters displayed slots */
  meal_period?: string;
}

export interface LastRestaurantSearchContext {
  venues: PendingRestaurantSummary[];
  updated_at: string;
  search_params: LastRestaurantSearchParams;
  /** Set when the user focuses on one restaurant (availability, image reply, etc.). */
  selected_venue_id?: number;
}

/** Awaiting user "yes" before book_restaurant_table runs with confirm=true. */
export interface PendingRestaurantBooking {
  venue_id: number;
  venue_name: string;
  date: string;
  time: string;
  party_size: number;
  config_token: string;
  slot_type?: string;
  address?: string;
  updated_at: string;
}

/** Tracks the iMessage guid for the most recent preview-card photo stack. */
export interface LastSentPreviewCards {
  parentMessageId: string;
  kind: 'restaurant' | 'flight' | 'flight_outbound' | 'flight_return';
  optionCount: number;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  phone: string;
  name: string;
  /** Home city from SMS onboarding; default for restaurant / local search. */
  city?: string | null;
  email: string;
  date_of_birth: string; // YYYY-MM-DD
  gender: 'm' | 'f';
  passport_number?: string;
  stripe_customer_id: string | null;
  stripe_spt_id: string | null;
  pending_order_id?: string | null;
  pending_order_amount?: string | null;
  pending_order_currency?: string | null;
  pending_booking_reference?: string | null;
  created_at: string;
  last_flight_search?: LastFlightSearchContext | null;
  /** Leg-by-leg round-trip builder state (departure -> return -> book). */
  flight_trip_builder?: FlightTripBuilder | null;
  last_restaurant_search?: LastRestaurantSearchContext | null;
  pending_restaurant_booking?: PendingRestaurantBooking | null;
  last_sent_preview_cards?: LastSentPreviewCards | null;
  /** Last held order: GET /offers + POST /orders payloads until cleared after payment. */
  pending_duffel_order?: Record<string, unknown> | null;
  /** Serialized link-cli auth credentials for Stripe Link wallet */
  link_auth_json?: string | null;
  link_connected_at?: string | null;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FlightOffer {
  id: string;
  total_amount: string;
  total_currency: string;
  slices: FlightSlice[];
  expires_at: string;
}

export interface FlightSlice {
  origin: string;
  destination: string;
  departure_date: string;
  segments: FlightSegment[];
}

export interface FlightSegment {
  departing_at: string;
  arriving_at: string;
  marketing_carrier_name: string;
  marketing_carrier_logo_lockup_url?: string;
  flight_number: string;
  origin: { iata_code: string };
  destination: { iata_code: string };
}

export interface HeldOrder {
  id: string;
  booking_reference: string;
  total_amount: string;
  total_currency: string;
  slices: FlightSlice[];
}

export type FlightBookingStatus = 'held' | 'confirmed';

export interface FlightBookingRecord {
  id: string;
  user_id: string;
  status: FlightBookingStatus;
  booking_reference: string | null;
  duffel_order_id: string;
  duffel_offer_id: string | null;
  origin: string | null;
  destination: string | null;
  departure_date: string | null;
  return_date: string | null;
  airline: string | null;
  total_amount: string | null;
  total_currency: string | null;
  stripe_payment_intent_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type RestaurantBookingStatus = 'active' | 'cancelled';

export interface RestaurantBookingRecord {
  id: string;
  user_id: string;
  venue_id: number;
  venue_name: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  confirmation_code: string | null;
  resy_token: string;
  location: string | null;
  seating_type: string | null;
  status: RestaurantBookingStatus;
  cancelled_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
