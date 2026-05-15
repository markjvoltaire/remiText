import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PoshEventCard } from './templates/PoshEventCard.js';
const WIDTH = 1080;
const HEIGHT = 1440;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONT_DIR = path.resolve(__dirname, '../../../assets/fonts');
const REGULAR_FONT_FILE = process.env.REMI_FONT_REGULAR ?? 'Inter-Regular.woff';
const BOLD_FONT_FILE = process.env.REMI_FONT_BOLD ?? 'Inter-Bold.woff';
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
function cacheKey(data) {
    const normalized = {
        title: data.title,
        venue: data.venue,
        when: data.when,
        city: data.city,
        shortLink: data.shortLink,
        optionLabel: data.optionLabel ?? '',
    };
    return createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
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
    const svg = await satori(PoshEventCard(data), {
        width: WIDTH,
        height: HEIGHT,
        fonts: [
            { name: 'Inter', data: regular, weight: 400, style: 'normal' },
            { name: 'Inter', data: bold, weight: 700, style: 'normal' },
        ],
    });
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: WIDTH },
    });
    return Buffer.from(resvg.render().asPng());
}
export async function generatePoshEventCardImage(data) {
    const key = cacheKey(data);
    const cached = cache.get(key);
    if (cached) {
        cache.delete(key);
        cache.set(key, cached);
        return cached;
    }
    try {
        const buffer = await renderToPng(data);
        const result = { buffer, contentType: 'image/png' };
        rememberInCache(key, result);
        return result;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[poshCardImage] generation failed: ${message}`);
        return null;
    }
}
