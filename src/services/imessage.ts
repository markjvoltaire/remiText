import { cloud } from 'spectrum-ts';
import type { TokenData } from 'spectrum-ts';
import { createClient, NotFoundError } from '@photon-ai/advanced-imessage';
import type { AdvancedIMessage, SharedFriendLocation } from '@photon-ai/advanced-imessage';
import { normalizeContactKey } from '../utils/contactId.js';

export type SharedFriendLocationResult =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      shortAddress?: string;
      longAddress?: string;
      locationType: SharedFriendLocation['locationType'];
    }
  | { ok: false; reason: 'not_sharing' | 'no_coordinates' };

export interface PhotoStackImage {
  buffer: Buffer;
  fileName: string;
}

interface PhotoStackOptions {
  /** Optional caption rendered alongside the photo stack bubble. */
  readonly text?: string;
}

const IMESSAGE_ADDRESS =
  process.env.SPECTRUM_IMESSAGE_ADDRESS ?? 'imessage.spectrum.photon.codes:443';

let _client: AdvancedIMessage | null = null;
let _tokenData: TokenData | null = null;
let _tokenExpiresAt = 0;
const EXPIRY_BUFFER_MS = 60_000;

async function getToken(): Promise<string> {
  if (_tokenData && Date.now() < _tokenExpiresAt - EXPIRY_BUFFER_MS) {
    const t = _tokenData;
    return t.type === 'shared' ? t.token : (Object.values(t.auth)[0] as string);
  }
  _tokenData = await cloud.issueImessageTokens(
    process.env.PROJECT_ID!,
    process.env.PROJECT_SECRET!,
  );
  _tokenExpiresAt = Date.now() + _tokenData.expiresIn * 1000;
  const t = _tokenData;
  return t.type === 'shared' ? t.token : (Object.values(t.auth)[0] as string);
}

function getClient(): AdvancedIMessage {
  if (!_client) {
    _client = createClient({
      address: IMESSAGE_ADDRESS,
      tls: true,
      // token is an undocumented option used internally by spectrum-ts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ token: getToken } as any),
    });
  }
  return _client;
}

export async function markRead(spaceId: string): Promise<void> {
  await getClient().chats.markRead(spaceId);
}

export async function getSharedFriendLocation(phone: string): Promise<SharedFriendLocationResult> {
  try {
    const loc = await getClient().locations.get(phone);
    if (loc.latitude === undefined || loc.longitude === undefined) {
      return { ok: false, reason: 'no_coordinates' };
    }
    return {
      ok: true,
      latitude: loc.latitude,
      longitude: loc.longitude,
      shortAddress: loc.shortAddress,
      longAddress: loc.longAddress,
      locationType: loc.locationType,
    };
  } catch (err) {
    if (err instanceof NotFoundError) {
      return { ok: false, reason: 'not_sharing' };
    }
    throw err;
  }
}

export async function listSharedFriendLocations(): Promise<SharedFriendLocation[]> {
  return getClient().locations.list();
}

/** Build a chat GUID from a normalized contact address (phone or email). */
export function chatGuidForContact(contactKey: string): string {
  return `any;-;${contactKey}`;
}

export async function sendTextMessage(chatGuid: string, text: string): Promise<string> {
  const sent = await getClient().messages.sendText(chatGuid, text);
  return sent.guid;
}

const LOCATION_WATCH_RECONNECT_MS = 5_000;

/**
 * Watches Find My location shares and invokes `onShare` for each live update.
 * Reconnects automatically when the stream drops.
 */
export function startLocationShareWatcher(
  onShare: (contactKey: string, location: SharedFriendLocation) => void | Promise<void>,
): void {
  void (async () => {
    while (true) {
      try {
        const stream = getClient().locations.watch();
        for await (const update of stream) {
          const contactKey = normalizeContactKey(update.location.address);
          if (!contactKey) continue;
          try {
            await onShare(contactKey, update.location);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[locations] onShare failed contact=${contactKey}: ${msg}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[locations] watch disconnected, reconnecting in ${LOCATION_WATCH_RECONNECT_MS}ms: ${msg}`);
        await new Promise((resolve) => setTimeout(resolve, LOCATION_WATCH_RECONNECT_MS));
      }
    }
  })();
}

/**
 * Send a single iMessage composed of multiple attachment parts plus an
 * optional text caption. iMessage renders 2+ attachment parts as a native
 * Photo Stack bubble (the stacked album UI). Single-image inputs work but
 * are typically more readable via the standard one-attachment send path.
 *
 * Returns the Photon-side message guid on success.
 */
export async function sendPhotoStack(
  spaceId: string,
  images: PhotoStackImage[],
  options: PhotoStackOptions = {},
): Promise<string> {
  if (images.length === 0) {
    throw new Error('sendPhotoStack requires at least 1 image');
  }

  const client = getClient();

  const uploaded = await Promise.all(
    images.map((img) =>
      client.attachments.upload({
        data: img.buffer,
        fileName: img.fileName,
      }),
    ),
  );

  const parts: Array<{ attachmentGuid?: string; attachmentName?: string; text?: string }> = [];
  uploaded.forEach((res, i) => {
    parts.push({
      attachmentGuid: res.attachment.guid,
      attachmentName: images[i]!.fileName,
    });
  });
  if (options.text && options.text.length > 0) {
    parts.push({ text: options.text });
  }

  const sent = await client.messages.sendMultipart(spaceId, parts);
  return sent.guid;
}

export interface InboundReplyTarget {
  guid: string;
  partIndex?: number;
}

/**
 * Resolve which message (and photo-stack part) the user replied to.
 * Spectrum drops reply metadata on inbound text, so we fetch from Photon when needed.
 */
export async function resolveInboundReplyTarget(
  spaceId: string,
  messageId: string,
  extras?: { replyTo?: { messageId: string } },
): Promise<InboundReplyTarget | null> {
  if (extras?.replyTo?.messageId) {
    const childMatch = extras.replyTo.messageId.match(/^p:(\d+)\/(.+)$/);
    if (childMatch) {
      return { guid: childMatch[2]!, partIndex: Number(childMatch[1]) };
    }
    return { guid: extras.replyTo.messageId };
  }

  try {
    const raw = await getClient().messages.get(spaceId, messageId);
    if (!raw.replyTargetGuid) return null;

    let partIndex: number | undefined;
    if (raw.threadOriginatorPart !== undefined && raw.threadOriginatorPart !== '') {
      const parsed = Number.parseInt(raw.threadOriginatorPart, 10);
      if (Number.isFinite(parsed)) partIndex = parsed;
    }

    return { guid: raw.replyTargetGuid, partIndex };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[imessage] resolveInboundReplyTarget failed msg=${messageId}: ${msg}`);
    return null;
  }
}
