alter table public.users
  add column if not exists pending_restaurant_booking jsonb;

comment on column public.users.pending_restaurant_booking is 'Staged Resy table booking awaiting user yes before reserveRestaurantTable runs.';
