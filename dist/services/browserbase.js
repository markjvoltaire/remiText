/**
 * Browserbase cloud browsers (https://browserbase.com).
 *
 * Env:
 * - BROWSERBASE_API_KEY — required for API calls
 * - BROWSERBASE_PROJECT_ID — optional; passed to session create when set (otherwise inferred from the key)
 */
import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright-core';
let client;
export function isBrowserbaseConfigured() {
    return Boolean(process.env.BROWSERBASE_API_KEY?.trim());
}
export function getBrowserbaseClient() {
    const apiKey = process.env.BROWSERBASE_API_KEY?.trim();
    if (!apiKey) {
        throw new Error('BROWSERBASE_API_KEY is not set');
    }
    if (!client) {
        client = new Browserbase({ apiKey });
    }
    return client;
}
export function browserbaseSessionDashboardUrl(sessionId) {
    return `https://browserbase.com/sessions/${sessionId}`;
}
export async function createBrowserbaseSession(params) {
    const bb = getBrowserbaseClient();
    const envProjectId = process.env.BROWSERBASE_PROJECT_ID?.trim();
    const merged = {
        ...params,
        ...(!params?.projectId && envProjectId ? { projectId: envProjectId } : {}),
    };
    return bb.sessions.create(merged);
}
/** Connect Playwright to a Browserbase session (use `playwright-core` only; no local browser install). */
export async function connectPlaywrightToBrowserbaseSession(session) {
    return chromium.connectOverCDP(session.connectUrl);
}
/**
 * Default context and first tab, as recommended for session recording.
 * https://docs.browserbase.com/reference/sdk/nodejs
 */
export function getBrowserbaseDefaultPage(browser) {
    const context = browser.contexts()[0];
    if (!context) {
        throw new Error('Browserbase browser has no default context');
    }
    const page = context.pages()[0];
    if (!page) {
        throw new Error('Browserbase default context has no pages');
    }
    return { context, page };
}
