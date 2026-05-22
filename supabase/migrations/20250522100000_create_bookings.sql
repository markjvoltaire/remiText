-- Persist completed and held flight orders and restaurant reservations.

create table if not exists public.flight_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null check (status in ('held', 'confirmed')),
  booking_reference text,
  duffel_order_id text not null,
  duffel_offer_id text,
  origin text,
  destination text,
  departure_date date,
  return_date date,
  airline text,
  total_amount text,
  total_currency text,
  stripe_payment_intent_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists flight_bookings_user_created_idx
  on public.flight_bookings (user_id, created_at desc);

create unique index if not exists flight_bookings_duffel_order_id_idx
  on public.flight_bookings (duffel_order_id);

create table if not exists public.restaurant_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  venue_id integer not null,
  venue_name text not null,
  reservation_date date not null,
  reservation_time text not null,
  party_size integer not null check (party_size >= 1 and party_size <= 20),
  confirmation_code text,
  resy_token text not null,
  location text,
  seating_type text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists restaurant_bookings_user_created_idx
  on public.restaurant_bookings (user_id, created_at desc);
