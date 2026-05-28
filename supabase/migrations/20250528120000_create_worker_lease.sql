-- Single-instance lease so only one remiText worker consumes the Spectrum
-- stream per PROJECT_ID. Multiple consumers on one PROJECT_ID trip Spectrum's
-- ip_per_minute (429) limit, which throws the worker into reconnect churn and
-- lets Photon send its gray "number didn't recognize yours" auto-reply.

create table if not exists public.worker_lease (
  id text primary key,
  holder text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- Atomically grab or renew the lease. Returns true when this holder owns it.
-- The single UPDATE/INSERT statement is row-locked, so concurrent workers
-- cannot both win: the loser re-evaluates the WHERE clause after the lock
-- releases and sees a fresh expiry held by someone else.
create or replace function public.acquire_worker_lease(
  p_id text,
  p_holder text,
  p_ttl_seconds integer
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_acquired boolean := false;
begin
  insert into public.worker_lease as wl (id, holder, expires_at, updated_at)
  values (
    p_id,
    p_holder,
    now() + make_interval(secs => p_ttl_seconds),
    now()
  )
  on conflict (id) do update
    set holder = excluded.holder,
        expires_at = excluded.expires_at,
        updated_at = now()
    where wl.holder = p_holder
       or wl.expires_at < now()
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

-- Release the lease on graceful shutdown so a standby/next deploy can take over
-- immediately instead of waiting for the TTL to expire. Only the current holder
-- can release (expire) it.
create or replace function public.release_worker_lease(
  p_id text,
  p_holder text
) returns void
language sql
set search_path = ''
as $$
  -- Expire one second in the past so a standby polling in a later transaction
  -- always sees it as reclaimable (now() is frozen within a transaction).
  update public.worker_lease
  set expires_at = now() - make_interval(secs => 1), updated_at = now()
  where id = p_id and holder = p_holder;
$$;
