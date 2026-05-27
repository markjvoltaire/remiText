alter table public.users
  add column if not exists city text;

alter table public.onboarding_sessions
  add column if not exists city text;

comment on column public.users.city is 'Home city collected at SMS onboarding; default for local search.';
