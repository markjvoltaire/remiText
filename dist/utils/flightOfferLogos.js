import { attachment } from 'spectrum-ts';
function mimeForLogoUrl(url) {
    const lower = url.split('?')[0]?.toLowerCase() ?? '';
    if (lower.endsWith('.svg'))
        return { ext: 'svg', mimeType: 'image/svg+xml' };
    if (lower.endsWith('.png'))
        return { ext: 'png', mimeType: 'image/png' };
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
        return { ext: 'jpg', mimeType: 'image/jpeg' };
    if (lower.endsWith('.webp'))
        return { ext: 'webp', mimeType: 'image/webp' };
    return { ext: 'svg', mimeType: 'image/svg+xml' };
}
function carrierFilePrefix(flightNumber, index) {
    if (!flightNumber)
        return `opt${index + 1}`;
    const letters = flightNumber.match(/^[A-Za-z]+/)?.[0];
    return letters?.toLowerCase() || `opt${index + 1}`;
}
/**
 * Sends airline logos as separate image messages. Spectrum's iMessage provider
 * does not support `group` (it logs "skipping"), so we use variadic `reply`,
 * which sends one attachment per outbound message in order.
 */
export async function sendFlightOfferLogos(message, offers) {
    const max = Math.min(offers.length, 5);
    const builders = [];
    for (let i = 0; i < max; i++) {
        const seg = offers[i]?.slices[0]?.segments[0];
        const url = seg?.logo_symbol_url;
        if (!url)
            continue;
        try {
            const res = await fetch(url, { headers: { Accept: 'image/*,*/*' } });
            if (!res.ok) {
                console.warn(`[flightLogos] HTTP ${res.status} for offer ${offers[i].id}`);
                continue;
            }
            const buf = Buffer.from(await res.arrayBuffer());
            const { ext, mimeType } = mimeForLogoUrl(url);
            const prefix = carrierFilePrefix(seg.flight_number, i);
            builders.push(attachment(buf, {
                name: `${prefix}-${i + 1}.${ext}`,
                mimeType,
            }));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[flightLogos] fetch failed offer=${offers[i].id}: ${msg}`);
        }
    }
    if (builders.length === 0)
        return;
    for (const item of builders) {
        await message.reply(item);
    }
}
