/**
 * Local preview: Satori → Resvg PNG in the browser.
 *
 *   npm run preview:flight-card
 *
 * Uses tsx watch: saving FlightCard.tsx or this folder restarts the server; refresh the browser.
 */
import 'dotenv/config';
import http from 'node:http';
import { generateFlightCardImage } from '../renderFlightCard.js';
import { HARDCODED_FLIGHT_CARD_INPUT } from './hardcodedFlightCard.js';
const PORT = Number(process.env.FLIGHT_CARD_PREVIEW_PORT ?? '3847');
const HOST = '127.0.0.1';
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Flight card preview</title>
  <style>
    body { margin: 0; background: #1a1a1a; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; font-family: system-ui, sans-serif; color: #e5e5e5; }
    img { max-width: min(90vw, 540px); height: auto; border-radius: 12px; box-shadow: 0 12px 48px rgba(0,0,0,0.45); }
    p { font-size: 14px; opacity: 0.85; max-width: 36rem; text-align: center; }
    code { background: #333; padding: 2px 8px; border-radius: 6px; }
  </style>
</head>
<body>
  <p>This dev server runs with <code>tsx watch</code>: save <code>FlightCard.tsx</code> (or hardcoded sample), wait for the terminal restart line, then refresh the page. Preview always bypasses the flight-card image cache.</p>
  <img src="/flight-card.png" width="1080" height="1440" alt="Flight card preview" />
</body>
</html>`;
http
    .createServer(async (req, res) => {
    const path = req.url?.split('?')[0] ?? '/';
    if (path === '/' || path === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML);
        return;
    }
    if (path === '/flight-card.png') {
        const img = await generateFlightCardImage(HARDCODED_FLIGHT_CARD_INPUT, {
            skipCache: true,
        });
        if (!img) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('generateFlightCardImage returned null (check logs / fonts).');
            return;
        }
        res.writeHead(200, {
            'Content-Type': img.contentType,
            'Cache-Control': 'no-store',
        });
        res.end(img.buffer);
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
})
    .listen(PORT, HOST, () => {
    console.log(`Flight card preview: http://${HOST}:${PORT}/`);
});
