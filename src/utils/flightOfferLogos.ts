import { attachment, group } from 'spectrum-ts';
import type { Message } from 'spectrum-ts';
import type { FlightOffer } from '../types.js';

function mimeForLogoUrl(url: string): { ext: string; mimeType: string } {
  const lower = url.split('?')[0]?.toLowerCase() ?? '';
  if (lower.endsWith('.svg')) return { ext: 'svg', mimeType: 'image/svg+xml' };
  if (lower.endsWith('.png')) return { ext: 'png', mimeType: 'image/png' };
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (lower.endsWith('.webp')) return { ext: 'webp', mimeType: 'image/webp' };
  return { ext: 'svg', mimeType: 'image/svg+xml' };
}

function carrierFilePrefix(flightNumber: string | undefined, index: number): string {
  if (!flightNumber) return `opt${index + 1}`;
  const letters = flightNumber.match(/^[A-Za-z]+/)?.[0];
  return letters?.toLowerCase() || `opt${index + 1}`;
}

/**
 * Sends airline logos for search results as one bundled message when the
 * platform supports `group` (e.g. iMessage photo album).
 */
export async function sendFlightOfferLogos(message: Message, offers: FlightOffer[]): Promise<void> {
  const max = Math.min(offers.length, 5);
  const builders: ReturnType<typeof attachment>[] = [];

  for (let i = 0; i < max; i++) {
    const seg = offers[i]?.slices[0]?.segments[0];
    const url = seg?.logo_symbol_url;
    if (!url) continue;

    try {
      const res = await fetch(url, { headers: { Accept: 'image/*,*/*' } });
      if (!res.ok) {
        console.warn(`[flightLogos] HTTP ${res.status} for offer ${offers[i].id}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const { ext, mimeType } = mimeForLogoUrl(url);
      const prefix = carrierFilePrefix(seg.flight_number, i);
      builders.push(
        attachment(buf, {
          name: `${prefix}-${i + 1}.${ext}`,
          mimeType,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[flightLogos] fetch failed offer=${offers[i].id}: ${msg}`);
    }
  }

  if (builders.length === 0) return;

  if (builders.length === 1) {
    await message.reply(builders[0]!);
    return;
  }

  const first = builders[0]!;
  const second = builders[1]!;
  const rest = builders.slice(2);
  await message.reply(group(first, second, ...rest));
}
