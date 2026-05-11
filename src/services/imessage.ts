import { cloud } from 'spectrum-ts';
import type { TokenData } from 'spectrum-ts';
import { createClient } from '@photon-ai/advanced-imessage';
import type { AdvancedIMessage } from '@photon-ai/advanced-imessage';

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
