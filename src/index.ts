import 'dotenv/config';

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
});

import { FLIGHT_CARD_TEMPLATE_VERSION } from './images/satori/renderFlightCard.js';
import { assertSeenMessagesTableReady } from './services/supabase.js';
import { getStreamStaleMs, getStreamRefreshMs, startHealthServer } from './stream/health.js';
import { runSpectrumForever } from './stream/session.js';

const port = Number(process.env.PORT);

await assertSeenMessagesTableReady();

startHealthServer(port);

console.log(
  `[boot] Remi starting staleMs=${getStreamStaleMs() || 'off'} refreshMs=${getStreamRefreshMs() || 'off'}` +
    ` flightCard=${FLIGHT_CARD_TEMPLATE_VERSION}` +
    (Number.isFinite(port) && port > 0 ? ` healthPort=${port}` : ''),
);

await runSpectrumForever();
