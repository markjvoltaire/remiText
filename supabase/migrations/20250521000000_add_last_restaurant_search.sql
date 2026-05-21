alter table public.users
  add column if not exists last_restaurant_search jsonb;
