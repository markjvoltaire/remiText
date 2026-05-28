import 'dotenv/config';
process.on('uncaughtException', (err) => {
    console.error('[fatal] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[fatal] unhandledRejection:', reason);
});
import { FLIGHT_CARD_TEMPLATE_VERSION } from './images/satori/renderFlightCard.js';
import { assertSeenMessagesTableReady } from './services/supabase.js';
import { getStreamStaleMs, getStreamRefreshMs, setWaitingForLease, startHealthServer, } from './stream/health.js';
import { acquireLeaseOrWait, isLeaseEnabled, LeaseNotInstalledError, releaseLease, startLeaseHeartbeat, } from './stream/lease.js';
import { runSpectrumForever } from './stream/session.js';
const port = Number(process.env.PORT);
await assertSeenMessagesTableReady();
startHealthServer(port);
console.log(`[boot] Remi starting staleMs=${getStreamStaleMs() || 'off'} refreshMs=${getStreamRefreshMs() || 'off'}` +
    ` flightCard=${FLIGHT_CARD_TEMPLATE_VERSION} lease=${isLeaseEnabled() ? 'on' : 'off'}` +
    (Number.isFinite(port) && port > 0 ? ` healthPort=${port}` : ''));
// Guarantee a single Spectrum consumer per PROJECT_ID. A standby instance waits
// here (without connecting) until the active worker releases or its lease
// expires, then takes over as the sole consumer.
if (isLeaseEnabled()) {
    try {
        setWaitingForLease(true);
        const lease = await acquireLeaseOrWait();
        setWaitingForLease(false);
        startLeaseHeartbeat(lease, () => {
            console.error('[fatal] lost worker lease — exiting so the new holder is the only consumer');
            process.exit(1);
        });
        let shuttingDown = false;
        const shutdown = (signal) => {
            if (shuttingDown)
                return;
            shuttingDown = true;
            console.log(`[lease] ${signal} received — releasing lease for fast handoff`);
            void releaseLease(lease)
                .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[lease] release on ${signal} failed: ${msg}`);
            })
                .finally(() => process.exit(0));
        };
        process.once('SIGTERM', () => shutdown('SIGTERM'));
        process.once('SIGINT', () => shutdown('SIGINT'));
    }
    catch (err) {
        setWaitingForLease(false);
        if (err instanceof LeaseNotInstalledError) {
            console.warn(`[lease] ${err.message} — running WITHOUT single-instance guard. ` +
                'Apply the migration and redeploy to prevent duplicate-consumer 429 churn.');
        }
        else {
            throw err;
        }
    }
}
else {
    console.log('[lease] disabled — running without single-instance guard');
}
await runSpectrumForever();
