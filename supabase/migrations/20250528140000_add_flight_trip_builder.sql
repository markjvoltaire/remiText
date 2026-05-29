alter table public.users
  add column if not exists flight_trip_builder jsonb;

comment on column public.users.flight_trip_builder is 'Leg-by-leg round-trip builder state: selected departure/return partial offers and combined fare before booking.';
