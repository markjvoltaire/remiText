import { cloud } from 'spectrum-ts';
import { createClient, NotFoundError } from '@photon-ai/advanced-imessage';
import { normalizeContactKey } from '../utils/contactId.js';
const IMESSAGE_ADDRESS = process.env.SPECTRUM_IMESSAGE_ADDRESS ?? 'imessage.spectrum.photon.codes:443';
let _client = null;
let _tokenData = null;
let _tokenExpiresAt = 0;
const EXPIRY_BUFFER_MS = 60_000;
async function getToken() {
    if (_tokenData && Date.now() < _tokenExpiresAt - EXPIRY_BUFFER_MS) {
        const t = _tokenData;
        return t.type === 'shared' ? t.token : Object.values(t.auth)[0];
    }
    _tokenData = await cloud.issueImessageTokens(process.env.PROJECT_ID, process.env.PROJECT_SECRET);
    _tokenExpiresAt = Date.now() + _tokenData.expiresIn * 1000;
    const t = _tokenData;
    return t.type === 'shared' ? t.token : Object.values(t.auth)[0];
}
function getClient() {
    if (!_client) {
        _client = createClient({
            address: IMESSAGE_ADDRESS,
            tls: true,
            // token is an undocumented option used internally by spectrum-ts
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...{ token: getToken },
        });
    }
    return _client;
}
export async function markRead(spaceId) {
    await getClient().chats.markRead(spaceId);
}
export async function getSharedFriendLocation(phone) {
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
    }
    catch (err) {
        if (err instanceof NotFoundError) {
            return { ok: false, reason: 'not_sharing' };
        }
        throw err;
    }
}
export async function listSharedFriendLocations() {
    return getClient().locations.list();
}
/** Build a chat GUID from a normalized contact address (phone or email). */
export function chatGuidForContact(contactKey) {
    return `any;-;${contactKey}`;
}
export async function sendTextMessage(chatGuid, text) {
    const sent = await getClient().messages.sendText(chatGuid, text);
    return sent.guid;
}
const LOCATION_WATCH_RECONNECT_MS = 5_000;
/**
 * Watches Find My location shares and invokes `onShare` for each live update.
 * Reconnects automatically when the stream drops.
 */
export function startLocationShareWatcher(onShare) {
    void (async () => {
        while (true) {
            try {
                const stream = getClient().locations.watch();
                for await (const update of stream) {
                    const contactKey = normalizeContactKey(update.location.address);
                    if (!contactKey)
                        continue;
                    try {
                        await onShare(contactKey, update.location);
                    }
                    catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        console.warn(`[locations] onShare failed contact=${contactKey}: ${msg}`);
                    }
                }
            }
            catch (err) {
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
export async function sendPhotoStack(spaceId, images, options = {}) {
    if (images.length === 0) {
        throw new Error('sendPhotoStack requires at least 1 image');
    }
    const client = getClient();
    const uploaded = await Promise.all(images.map((img) => client.attachments.upload({
        data: img.buffer,
        fileName: img.fileName,
    })));
    const parts = [];
    uploaded.forEach((res, i) => {
        parts.push({
            attachmentGuid: res.attachment.guid,
            attachmentName: images[i].fileName,
        });
    });
    if (options.text && options.text.length > 0) {
        parts.push({ text: options.text });
    }
    const sent = await client.messages.sendMultipart(spaceId, parts);
    return sent.guid;
}
