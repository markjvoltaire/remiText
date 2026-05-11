import sharp from 'sharp';
import { attachment } from 'spectrum-ts';
import type { Message } from 'spectrum-ts';
import type { FlightOffer } from '../types.js';

function isSvgBytes(buf: Buffer, contentType: string | null, url: string): boolean {
  if (contentType?.toLowerCase().includes('svg')) return true;
  if (url.split('?')[0]?.toLowerCase().endsWith('.svg')) return true;
  const sniff = buf.subarray(0, 256).toString('utf8').trimStart().toLowerCase();
  return sniff.startsWith('<?xml') || sniff.startsWith('<svg');
}

function carrierFilePrefix(flightNumber: string | undefined, index: number): string {
  if (!flightNumber) return `opt${index + 1}`;
  const letters = flightNumber.match(/^[A-Za-z]+/)?.[0];
  return letters?.toLowerCase() || `opt${index + 1}`;
}

async function rasterizeIfSvg(
  buf: Buffer,
  contentType: string | null,
  url: string,
): Promise<{ data: Buffer; ext: string; mimeType: string }> {
  if (isSvgBytes(buf, contentType, url)) {
    const png = await sharp(buf, { density: 384 })
      .resize({ width: 512, height: 512, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    return { data: png, ext: 'png', mimeType: 'image/png' };
  }
  const lower = url.split('?')[0]?.toLowerCase() ?? '';
  if (lower.endsWith('.png')) return { data: buf, ext: 'png', mimeType: 'image/png' };
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
    return { data: buf, ext: 'jpg', mimeType: 'image/jpeg' };
  if (lower.endsWith('.webp')) return { data: buf, ext: 'webp', mimeType: 'image/webp' };
  return { data: buf, ext: 'png', mimeType: contentType ?? 'image/png' };
}

/**
 * Sends airline logos as separate inline image messages. Duffel returns SVGs
 * which iMessage treats as generic file attachments — we rasterize to PNG so
 * the recipient sees inline thumbnails. Spectrum's iMessage provider also
 * does not support `group`, so we issue one `reply` per logo.
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
      const raw = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type');
      const { data, ext, mimeType } = await rasterizeIfSvg(raw, contentType, url);
      const prefix = carrierFilePrefix(seg.flight_number, i);
      builders.push(
        attachment(data, {
          name: `${prefix}-${i + 1}.${ext}`,
          mimeType,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[flightLogos] prepare failed offer=${offers[i].id}: ${msg}`);
    }
  }

  if (builders.length === 0) return;

  for (const item of builders) {
    await message.reply(item);
  }
}
