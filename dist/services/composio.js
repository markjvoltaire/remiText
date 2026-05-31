import { Composio } from '@composio/core';
/** Composio toolkit slug (lowercase). */
export const TICKETMASTER_TOOLKIT = 'ticketmaster';
/** Pinned Ticketmaster toolkit version from Composio (see toolkit meta availableVersions). */
export const TICKETMASTER_TOOLKIT_VERSION = process.env.COMPOSIO_TICKETMASTER_VERSION?.trim() || '20260417_00';
let client = null;
export function isComposioConfigured() {
    return Boolean(process.env.COMPOSIO_API_KEY?.trim());
}
export function getTicketmasterConnectedAccountId() {
    return process.env.COMPOSIO_TICKETMASTER_CONNECTED_ACCOUNT_ID?.trim() || undefined;
}
export function getComposioClient() {
    const apiKey = process.env.COMPOSIO_API_KEY?.trim();
    if (!apiKey) {
        throw new Error('COMPOSIO_API_KEY is not set');
    }
    if (!client) {
        client = new Composio({
            apiKey,
            toolkitVersions: {
                [TICKETMASTER_TOOLKIT]: TICKETMASTER_TOOLKIT_VERSION,
            },
        });
    }
    return client;
}
/**
 * Composio entity id. Ticketmaster Discovery uses a shared platform API key;
 * pair with COMPOSIO_TICKETMASTER_CONNECTED_ACCOUNT_ID when auth is linked once in Composio.
 */
export function composioUserId(userId) {
    return process.env.COMPOSIO_ENTITY_ID?.trim() || `remi-${userId}`;
}
export async function executeComposioTool(slug, userId, arguments_, options = {}) {
    const composio = getComposioClient();
    const body = {
        userId: composioUserId(userId),
        arguments: arguments_,
        version: options.version ?? TICKETMASTER_TOOLKIT_VERSION,
    };
    const connectedAccountId = options.connectedAccountId ?? getTicketmasterConnectedAccountId();
    if (connectedAccountId) {
        body.connectedAccountId = connectedAccountId;
    }
    const raw = await composio.tools.execute(slug, body);
    return raw;
}
export function parseComposioData(result) {
    const { data } = result;
    if (data == null)
        return null;
    if (typeof data === 'string') {
        try {
            return JSON.parse(data);
        }
        catch {
            return data;
        }
    }
    return data;
}
export function composioResultOk(result) {
    if (result.successful === false || result.success === false)
        return false;
    if (result.error)
        return false;
    return true;
}
/** User-facing hint when Composio returns auth / connection errors. */
export function formatComposioConnectionError(message) {
    if (/connected account|connection|auth config|1810/i.test(message)) {
        return ('Ticketmaster is not connected in Composio yet. ' +
            'In the Composio dashboard, add your Ticketmaster Discovery API key, link the toolkit once, ' +
            'then set COMPOSIO_TICKETMASTER_CONNECTED_ACCOUNT_ID on the worker.');
    }
    if (/toolkit version/i.test(message)) {
        return `Ticketmaster toolkit version mismatch. Set COMPOSIO_TICKETMASTER_VERSION=${TICKETMASTER_TOOLKIT_VERSION} on the worker.`;
    }
    return message;
}
