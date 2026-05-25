import 'dotenv/config';
import http from 'node:http';

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
});

import { Spectrum } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { terminal } from 'spectrum-ts/providers/terminal';
import { handleMessage } from './handlers/message.js';
import { assertSeenMessagesTableReady } from './services/supabase.js';

const PROVIDER = (process.env.SPECTRUM_PROVIDER ?? 'imessage').toLowerCase();

const port = Number(process.env.PORT);
if (Number.isFinite(port) && port > 0) {
  http
    .createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
    })
    .listen(port, '0.0.0.0', () => {
      console.log(`Health check listening on 0.0.0.0:${port}`);
    });
}

const app = await Spectrum({
  projectId: process.env.PROJECT_ID!,
  projectSecret: process.env.PROJECT_SECRET!,
  providers: [
    PROVIDER === 'terminal' ? terminal.config() : imessage.config(),
  ],
});

await assertSeenMessagesTableReady();

console.log(`Remi is online. provider=${PROVIDER}`);

for await (const [space, message] of app.messages) {
  try {
    await space.responding(async () => {
      await handleMessage(space, message);
    });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    console.error(`Error handling message in space ${space.id}:`, messageText);
  }
}
