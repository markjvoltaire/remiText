import { Spectrum } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { terminal } from 'spectrum-ts/providers/terminal';
import { handleMessage } from '../handlers/message.js';
import { isResyConfigured, warmResyAuth } from '../services/resy.js';
import { getLastInboundBeforeSession, getStreamRefreshMs, getStreamStaleMs, isStreamRefreshDue, isStreamStale, markConnected, markConnecting, markReconnecting, recordInbound, } from './health.js';
import { computeReconnectDelayMs, sleep } from './reconnect.js';
const PROVIDER = (process.env.SPECTRUM_PROVIDER ?? 'imessage').toLowerCase();
function createSpectrum() {
    return Spectrum({
        projectId: process.env.PROJECT_ID,
        projectSecret: process.env.PROJECT_SECRET,
        providers: [
            PROVIDER === 'terminal' ? terminal.config() : imessage.config(),
        ],
    });
}
function waitForStreamInterrupt() {
    const staleMs = getStreamStaleMs();
    const refreshMs = getStreamRefreshMs();
    const pollMs = Math.min(30_000, Math.max(5_000, Math.min(staleMs || 30_000, refreshMs || 30_000) / 2));
    let intervalId;
    const promise = new Promise((resolve) => {
        const tick = () => {
            if (isStreamStale()) {
                resolve('stale');
                return;
            }
            if (isStreamRefreshDue()) {
                resolve('refresh');
                return;
            }
        };
        tick();
        intervalId = setInterval(tick, pollMs);
        intervalId.unref?.();
    });
    return {
        promise,
        cancel: () => {
            if (intervalId)
                clearInterval(intervalId);
        },
    };
}
async function consumeMessages(app) {
    let inboundThisSession = 0;
    const interrupt = waitForStreamInterrupt();
    try {
        const consume = (async () => {
            try {
                for await (const [space, message] of app.messages) {
                    recordInbound();
                    inboundThisSession += 1;
                    if (inboundThisSession === 1) {
                        const prev = getLastInboundBeforeSession();
                        const idleMs = prev ? Date.now() - prev : null;
                        console.log(`[stream] first inbound after connect provider=${PROVIDER}` +
                            (idleMs != null ? ` idleSinceLastInboundMs=${idleMs}` : ' (no prior inbound)'));
                    }
                    try {
                        await space.responding(async () => {
                            await handleMessage(space, message);
                        });
                    }
                    catch (err) {
                        const messageText = err instanceof Error ? err.message : String(err);
                        console.error(`[msg] handler error space=${space.id}:`, messageText);
                    }
                    if (isStreamStale() || isStreamRefreshDue()) {
                        return isStreamStale() ? 'stale' : 'refresh';
                    }
                }
                return 'ended';
            }
            catch (err) {
                const messageText = err instanceof Error ? err.message : String(err);
                console.error('[stream] message iterator error:', messageText);
                throw err;
            }
        })();
        return await Promise.race([consume, interrupt.promise]);
    }
    catch {
        return 'error';
    }
    finally {
        interrupt.cancel();
    }
}
export async function runSpectrumSession() {
    markConnecting();
    console.log(`[stream] connecting provider=${PROVIDER}`);
    const app = await createSpectrum();
    markConnected();
    console.log(`[stream] connected staleMs=${getStreamStaleMs() || 'off'} refreshMs=${getStreamRefreshMs() || 'off'}`);
    if (isResyConfigured()) {
        warmResyAuth().catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[resy] warm auth on connect failed: ${msg}`);
        });
    }
    let reason = 'ended';
    try {
        reason = await consumeMessages(app);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[stream] session error:', msg);
        reason = 'error';
    }
    finally {
        console.log(`[stream] stopping (${reason})`);
        await app.stop().catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[stream] app.stop failed: ${msg}`);
        });
    }
    return reason;
}
export async function runSpectrumForever() {
    let errorAttempt = 0;
    const maxFailures = Number(process.env.STREAM_MAX_RECONNECT_FAILURES ?? 0);
    for (;;) {
        const reason = await runSpectrumSession();
        if (reason === 'ended') {
            console.warn('[stream] iterator ended — reconnecting');
        }
        else if (reason === 'stale') {
            console.warn(`[stream] no inbound for ${getStreamStaleMs()}ms — recycling connection`);
        }
        else if (reason === 'refresh') {
            console.log(`[stream] proactive refresh after ${getStreamRefreshMs()}ms connected`);
        }
        else if (reason === 'error') {
            console.warn('[stream] session ended with error — reconnecting');
        }
        if (reason === 'error') {
            errorAttempt += 1;
            if (maxFailures > 0 && errorAttempt >= maxFailures) {
                console.error(`[fatal] ${maxFailures} consecutive session errors — exiting for Render restart`);
                process.exit(1);
            }
        }
        else {
            errorAttempt = 0;
        }
        markReconnecting(reason);
        const delay = computeReconnectDelayMs(errorAttempt);
        console.log(`[stream] reconnect in ${(delay / 1000).toFixed(1)}s` +
            (errorAttempt > 0 ? ` (error attempt ${errorAttempt})` : ''));
        await sleep(delay);
    }
}
