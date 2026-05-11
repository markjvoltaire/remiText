-- Idempotent dedupe for inbound message IDs (cross-process / multi-instance).
create table if not exists public.seen_messages (
  id text primary key,
  created_at timestamptz not null default now()
);
