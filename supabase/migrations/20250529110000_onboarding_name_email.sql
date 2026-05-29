-- SMS onboarding: first name → last name → email → web Link setup
alter table public.onboarding_sessions
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text;

comment on column public.onboarding_sessions.first_name is 'Collected during SMS onboarding';
comment on column public.onboarding_sessions.last_name is 'Collected during SMS onboarding';
comment on column public.onboarding_sessions.email is 'Collected during SMS onboarding';
