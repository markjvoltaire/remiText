import { cloud } from 'spectrum-ts';
import { createClient } from '@photon-ai/advanced-imessage';
import { normalizeContactKey } from '../utils/contactId.js';
import { parseChildMessageId } from '../utils/replyContext.js';
const SHARED_IMESSAGE_ADDRESS = process.env.SPECTRUM_IMESSAGE_ADDRESS ?? 'imessage.spectrum.photon.codes:443';
let _client = null;
let _clientAddress = null;
let _dedicatedInstanceId = null;
let _tokenData = null;
let _tokenExpiresAt = 0;
const EXPIRY_BUFFER_MS = 60_000;
async function refreshTokenData() {
    if (_tokenData && Date.now() < _tokenExpiresAt - EXPIRY_BUFFER_MS) {
        return _tokenData;
    }
    _tokenData = await cloud.issueImessageTokens(process.env.PROJECT_ID, process.env.PROJECT_SECRET);
    _tokenExpiresAt = Date.now() + _tokenData.expiresIn * 1000;
    return _tokenData;
}
function resolveDedicatedInstanceId(data) {
    const remiPhone = process.env.REMI_PHONE?.trim();
    if (remiPhone) {
        const target = normalizeContactKey(remiPhone);
        for (const [instanceId, phone] of Object.entries(data.numbers)) {
            if (phone && normalizeContactKey(phone) === target)
                return instanceId;
        }
        throw new Error(`No iMessage instance assigned to REMI_PHONE ${remiPhone}`);
    }
    const first = Object.entries(data.numbers).find(([, phone]) => phone);
    if (!first)
        throw new Error('No iMessage instance with phone assigned');
    return first[0];
}
function resolveClientAddress(data) {
    if (data.type === 'shared')
        return SHARED_IMESSAGE_ADDRESS;
    _dedicatedInstanceId = resolveDedicatedInstanceId(data);
    return `${_dedicatedInstanceId}.imsg.photon.codes:443`;
}
async function issueBearerToken(data) {
    if (data.type === 'shared')
        return data.token;
    const instanceId = _dedicatedInstanceId ?? resolveDedicatedInstanceId(data);
    return data.auth[instanceId] ?? '';
}
async function ensureClient() {
    const tokenData = await refreshTokenData();
    const address = resolveClientAddress(tokenData);
    if (!_client || _clientAddress !== address) {
        if (_client)
            await _client.close().catch(() => { });
        _clientAddress = address;
        _client = createClient({
            address,
            tls: true,
            token: async () => issueBearerToken(await refreshTokenData()),
        });
        const phone = tokenData.type === 'dedicated' && _dedicatedInstanceId
            ? tokenData.numbers[_dedicatedInstanceId]
            : null;
        console.log(`[imessage] gRPC ${address} type=${tokenData.type}${phone ? ` phone=${phone}` : ''}`);
    }
    return _client;
}
async function getClient() {
    return ensureClient();
}
export async function markRead(spaceId) {
    await (await getClient()).chats.markRead(spaceId);
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
    const client = await getClient();
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
        const page = await (await getClient()).messages.listInChat(spaceId, {
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
        const message = await (await getClient()).messages.get(spaceId, target.guid);
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
            const raw = await (await getClient()).messages.get(spaceId, messageId);
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
