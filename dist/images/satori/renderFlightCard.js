import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { FlightCard } from "./templates/FlightCard.js";
/** Bump when card layout changes — busts in-process cache and shows in deploy logs. */
export const FLIGHT_CARD_TEMPLATE_VERSION = "v3-boarding-pass";
const WIDTH = 1080;
const HEIGHT = 1440;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONT_DIR = path.resolve(__dirname, "../../../assets/fonts");
const REGULAR_FONT_FILE = process.env.REMI_FONT_REGULAR ?? "Inter-Regular.woff";
const BOLD_FONT_FILE = process.env.REMI_FONT_BOLD ?? "Inter-Bold.woff";
let fontPromise = null;
async function loadFonts() {
    if (!fontPromise) {
        fontPromise = (async () => {
            const [regular, bold] = await Promise.all([
                readFile(path.join(FONT_DIR, REGULAR_FONT_FILE)),
                readFile(path.join(FONT_DIR, BOLD_FONT_FILE)),
            ]);
            return { regular, bold };
        })().catch((err) => {
            fontPromise = null;
            throw err;
        });
    }
    return fontPromise;
}
const MAX_CACHE_ENTRIES = 128;
const cache = new Map();
let loggedTemplateVersion = false;
function cacheKey(data) {
    const normalized = {
        airline: data.airline,
        logoUrl: data.logoUrl ?? "",
        origin: data.origin,
        destination: data.destination,
        departureTime: data.departureTime,
        arrivalTime: data.arrivalTime,
        price: data.price,
        duration: data.duration,
        stops: data.stops ?? 0,
        date: data.date ?? "",
        cabinClass: data.cabinClass ?? "",
        gate: data.gate ?? "",
        terminal: data.terminal ?? "",
        flightNumber: data.flightNumber ?? "",
        optionLabel: data.optionLabel ?? "",
    };
    return createHash("sha1")
        .update(FLIGHT_CARD_TEMPLATE_VERSION)
        .update(JSON.stringify(normalized))
        .digest("hex");
}
function rememberInCache(key, value) {
    if (cache.has(key)) {
        cache.delete(key);
    }
    else if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined)
            cache.delete(oldest);
    }
    cache.set(key, value);
}
async function renderToPng(data) {
    const { regular, bold } = await loadFonts();
    const svg = await satori(FlightCard(data), {
        width: WIDTH,
        height: HEIGHT,
        fonts: [
            { name: "Inter", data: regular, weight: 400, style: "normal" },
            { name: "Inter", data: bold, weight: 700, style: "normal" },
        ],
    });
    const resvg = new Resvg(svg, {
        fitTo: { mode: "width", value: WIDTH },
    });
    return Buffer.from(resvg.render().asPng());
}
/**
 * Render a shareable PNG flight card from structured flight data.
 *
 * Synchronous-style API that returns a Buffer suitable for upload or
 * direct attachment to a message. Identical inputs are memoized in an
 * in-memory LRU-ish cache so repeated calls within a process are fast.
 *
 * On any failure (font missing, satori/resvg crash, etc.) this resolves
 * to `null` so callers can fall back without blocking critical flows
 * like booking. The error is logged with `[flightCardImage]` for ops.
 */
export async function generateFlightCardImage(data) {
    const key = cacheKey(data);
    const cached = cache.get(key);
    if (cached) {
        cache.delete(key);
        cache.set(key, cached);
        return cached;
    }
    try {
        const buffer = await renderToPng(data);
        const result = { buffer, contentType: "image/png" };
        rememberInCache(key, result);
        if (!loggedTemplateVersion) {
            loggedTemplateVersion = true;
            console.log(`[flightCardImage] template=${FLIGHT_CARD_TEMPLATE_VERSION}`);
        }
        return result;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[flightCardImage] generation failed: ${message}`);
        return null;
    }
}
export const __testing = { cacheKey, WIDTH, HEIGHT };
