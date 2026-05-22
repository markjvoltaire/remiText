-- Track cancelled restaurant reservations.

alter table public.restaurant_bookings
  add column if not exists status text not null default 'active'
    check (status in ('active', 'cancelled'));

alter table public.restaurant_bookings
  add column if not exists cancelled_at timestamptz;
