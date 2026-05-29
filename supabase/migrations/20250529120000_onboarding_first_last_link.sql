-- Align remote DB with SMS onboarding + Link wallet (idempotent)
alter table public.onboarding_sessions
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.users
  add column if not exists link_auth_json text,
  add column if not exists link_connected_at timestamptz,
  add column if not exists link_connect_started_at timestamptz;
