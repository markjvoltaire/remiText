import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { acquireWorkerLease, releaseWorkerLease } from '../services/supabase.js';
import { sleep } from './reconnect.js';
// Single-instance guard: only one remiText worker may consume the Spectrum
// stream per PROJECT_ID. A second consumer (stray local `npm start`, an
// overlapping Render deploy, a duplicate service) trips Spectrum's
// ip_per_minute (429) limit and throws every worker into reconnect churn,
// during which Photon answers inbound texts with its gray auto-reply.
const LEASE_ENABLED = process.env.WORKER_LEASE_ENABLED !== '0';
const LEASE_TTL_MS = Math.max(5_000, Number(process.env.WORKER_LEASE_TTL_MS ?? 60_000));
const LEASE_HEARTBEAT_MS = Math.max(2_000, Number(process.env.WORKER_LEASE_HEARTBEAT_MS ?? Math.floor(LEASE_TTL_MS / 3)));
const LEASE_WAIT_POLL_MS = Math.max(2_000, Number(process.env.WORKER_LEASE_WAIT_POLL_MS ?? 15_000));
/** Thrown when the lease RPC/table migration has not been applied yet. */
export class LeaseNotInstalledError extends Error {
}
/** PostgREST/Postgres signatures for "function/table not found". */
function isMissingLeaseSchema(err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (msg.includes('pgrst202') ||
        msg.includes('could not find the function') ||
        msg.includes('does not exist') ||
        msg.includes('schema cache'));
}
function leaseId() {
    return `spectrum:${process.env.PROJECT_ID ?? 'default'}`;
}
function instanceHolder() {
    const renderId = process.env.RENDER_INSTANCE_ID ?? process.env.RENDER_SERVICE_ID;
    const base = renderId ?? hostname();
    return `${base}:${process.pid}:${randomUUID().slice(0, 8)}`;
}
function ttlSeconds(ttlMs) {
    return Math.max(5, Math.ceil(ttlMs / 1000));
}
export function isLeaseEnabled() {
    return (LEASE_ENABLED &&
        Boolean(process.env.SUPABASE_URL) &&
        Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
}
/**
 * Block until this process owns the lease. While another worker holds it we
 * only poll the lease row — we never open a Spectrum connection, so a standby
 * instance contributes zero connects toward the ip_per_minute limit.
 */
export async function acquireLeaseOrWait() {
    const id = leaseId();
    const holder = instanceHolder();
    const secs = ttlSeconds(LEASE_TTL_MS);
    let announcedWait = false;
    for (;;) {
        let ok = false;
        try {
            ok = await acquireWorkerLease(id, holder, secs);
        }
        catch (err) {
            if (isMissingLeaseSchema(err)) {
                throw new LeaseNotInstalledError('worker_lease migration not applied (run supabase/migrations/20250528120000_create_worker_lease.sql)');
            }
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[lease] acquire error (retrying in ${LEASE_WAIT_POLL_MS}ms): ${msg}`);
            await sleep(LEASE_WAIT_POLL_MS);
            continue;
        }
        if (ok) {
            console.log(`[lease] acquired id=${id} holder=${holder} ttlMs=${LEASE_TTL_MS}` +
                (announcedWait ? ' (after waiting for previous holder)' : ''));
            return { id, holder, ttlMs: LEASE_TTL_MS };
        }
        if (!announcedWait) {
            console.warn(`[lease] another worker holds id=${id} — standing by (not connecting to Spectrum to avoid 429 churn)`);
            announcedWait = true;
        }
        await sleep(LEASE_WAIT_POLL_MS);
    }
}
/**
 * Renew the lease on an interval. If renewal reports we no longer own it,
 * another worker has taken over and we must stop consuming immediately, so we
 * invoke `onLost`. Returns a stop function.
 */
export function startLeaseHeartbeat(lease, onLost) {
    const secs = ttlSeconds(lease.ttlMs);
    let stopped = false;
    const tick = async () => {
        if (stopped)
            return;
        try {
            const ok = await acquireWorkerLease(lease.id, lease.holder, secs);
            if (!ok && !stopped) {
                stopped = true;
                console.error(`[lease] lost id=${lease.id} holder=${lease.holder} — another worker took over`);
                onLost();
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[lease] heartbeat renew failed (will retry): ${msg}`);
        }
    };
    const interval = setInterval(() => {
        void tick();
    }, LEASE_HEARTBEAT_MS);
    interval.unref?.();
    return () => {
        stopped = true;
        clearInterval(interval);
    };
}
export async function releaseLease(lease) {
    await releaseWorkerLease(lease.id, lease.holder);
    console.log(`[lease] released id=${lease.id} holder=${lease.holder}`);
}
