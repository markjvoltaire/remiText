import { cloud } from 'spectrum-ts';
import { createClient, NotFoundError } from '@photon-ai/advanced-imessage';
import { normalizeContactKey } from '../utils/contactId.js';
import { parseChildMessageId } from '../utils/replyContext.js';
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
function extractReplyTargetFromAppleMessage(message) {
    if (!message.replyTargetGuid)
        return null;
    let partIndex;
    if (message.threadOriginatorPart !== undefined && message.threadOriginatorPart !== '') {
        const parsed = Number.parseInt(message.threadOriginatorPart, 10);
        if (Number.isFinite(parsed))
            partIndex = parsed;
    }
    return { guid: message.replyTargetGuid, partIndex };
}
function extractReplyTargetFromSpectrumMessage(message) {
    if (!message || typeof message !== 'object')
        return null;
    const record = message;
    const terminalReplyTo = record.replyTo;
    if (terminalReplyTo &&
        typeof terminalReplyTo === 'object' &&
        'messageId' in terminalReplyTo &&
        typeof terminalReplyTo.messageId === 'string') {
        const messageId = terminalReplyTo.messageId;
        const child = parseChildMessageId(messageId);
        if (child)
            return { guid: child.parentGuid, partIndex: child.partIndex };
        return { guid: messageId };
    }
    if (typeof record.parentId === 'string') {
        const partIndex = typeof record.partIndex === 'number' ? record.partIndex : undefined;
        return { guid: record.parentId, partIndex };
    }
    const content = record.content;
    if (content && typeof content === 'object' && content.type === 'custom') {
        const raw = content.raw;
        if (raw && typeof raw === 'object') {
            const rawRecord = raw;
            const guid = (typeof rawRecord.replyTargetGuid === 'string' && rawRecord.replyTargetGuid) ||
                (typeof rawRecord.reply_target_guid === 'string' && rawRecord.reply_target_guid) ||
                null;
            if (guid) {
                let partIndex;
                const partRaw = rawRecord.threadOriginatorPart ?? rawRecord.thread_originator_part;
                if (typeof partRaw === 'string' && partRaw !== '') {
                    const parsed = Number.parseInt(partRaw, 10);
                    if (Number.isFinite(parsed))
                        partIndex = parsed;
                }
                return { guid, partIndex };
            }
        }
    }
    return null;
}
async function findRecentInboundReplyTarget(spaceId, text) {
    const trimmed = text.trim();
    if (!trimmed)
        return null;
    try {
        const page = await getClient().messages.listInChat(spaceId, {
            pageSize: 25,
            isFromMe: false,
        });
        let best = null;
        for (const message of page.messages) {
            const msgText = message.content.text?.trim();
            if (msgText !== trimmed)
                continue;
            const target = extractReplyTargetFromAppleMessage(message);
            if (!target)
                continue;
            const at = message.dateCreated.getTime();
            if (!best || at > best.at) {
                best = { target, at };
            }
        }
        if (best) {
            console.log(`[imessage] reply target from chat history guid=${best.target.guid} part=${best.target.partIndex ?? 'none'}`);
            return best.target;
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[imessage] findRecentInboundReplyTarget failed space=${spaceId}: ${msg}`);
    }
    return null;
}
/** True when the user replied to a message Remi sent (not the user's own bubble). */
export async function isReplyToOurMessage(spaceId, target) {
    try {
        const message = await getClient().messages.get(spaceId, target.guid);
        return message.isFromMe;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[imessage] isReplyToOurMessage failed guid=${target.guid}: ${msg}`);
        return false;
    }
}
/**
 * Resolve which message (and photo-stack part) the user replied to.
 * Spectrum Cloud may rewrite message ids (spc-msg-*), so we also scan recent chat history.
 */
export async function resolveInboundReplyTarget(spaceId, messageId, text, spectrumMessage) {
    const fromSpectrum = spectrumMessage
        ? extractReplyTargetFromSpectrumMessage(spectrumMessage)
        : null;
    if (fromSpectrum) {
        console.log(`[imessage] reply target from spectrum message guid=${fromSpectrum.guid} part=${fromSpectrum.partIndex ?? 'none'}`);
        return fromSpectrum;
    }
    if (!messageId.startsWith('spc-')) {
        try {
            const raw = await getClient().messages.get(spaceId, messageId);
            const target = extractReplyTargetFromAppleMessage(raw);
            if (target) {
                console.log(`[imessage] reply target from message.get guid=${target.guid} part=${target.partIndex ?? 'none'}`);
                return target;
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[imessage] resolveInboundReplyTarget get failed msg=${messageId}: ${msg}`);
        }
    }
    return findRecentInboundReplyTarget(spaceId, text);
}
