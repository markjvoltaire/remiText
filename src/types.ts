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
}

export interface LastRestaurantSearchContext {
  venues: PendingRestaurantSummary[];
  updated_at: string;
  search_params: LastRestaurantSearchParams;
  /** Set when the user focuses on one restaurant (availability, image reply, etc.). */
  selected_venue_id?: number;
}

/** Tracks the iMessage guid for the most recent preview-card photo stack. */
export interface LastSentPreviewCards {
  parentMessageId: string;
  kind: 'restaurant' | 'flight';
  optionCount: number;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  phone: string;
  name: string;
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
  last_restaurant_search?: LastRestaurantSearchContext | null;
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
