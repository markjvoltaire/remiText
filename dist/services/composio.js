import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
let client = null;
export function isComposioConfigured() {
    return Boolean(process.env.COMPOSIO_API_KEY?.trim());
}
export function getComposioClient() {
    const apiKey = process.env.COMPOSIO_API_KEY?.trim();
    if (!apiKey) {
        throw new Error('COMPOSIO_API_KEY is not set');
    }
    if (!client) {
        client = new Composio({
            apiKey,
            provider: new AnthropicProvider(),
        });
    }
    return client;
}
/** Composio entity id — Ticketmaster Discovery uses a platform API key, not per-user OAuth. */
export function composioUserId(userId) {
    return `remi-${userId}`;
}
export async function executeComposioTool(slug, userId, arguments_) {
    const composio = getComposioClient();
    const raw = await composio.tools.execute(slug, {
        userId: composioUserId(userId),
        arguments: arguments_,
    });
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
