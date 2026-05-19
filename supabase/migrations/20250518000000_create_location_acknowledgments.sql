-- Tracks which contacts have received Remi's "location received" confirmation.
create table if not exists public.location_acknowledgments (
  contact_key text primary key,
  created_at timestamptz not null default now()
);
