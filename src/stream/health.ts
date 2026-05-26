import http from 'node:http';

export type StreamState = 'connecting' | 'connected' | 'reconnecting' | 'failed';

export type StreamEndReason = 'ended' | 'stale' | 'refresh' | 'error';

export interface StreamHealthSnapshot {
  state: StreamState;
  connectedAt: number | null;
  lastInboundAt: number | null;
  lastReconnectAt: number | null;
  reconnectAttempts: number;
  lastEndReason: StreamEndReason | null;
  lastError: string | null;
}

let snapshot: StreamHealthSnapshot = {
  state: 'reconnecting',
  connectedAt: null,
  lastInboundAt: null,
  lastReconnectAt: null,
  reconnectAttempts: 0,
  lastEndReason: null,
  lastError: null,
};

/** Last user message across sessions (for "first message after idle" logs). */
let lastInboundBeforeCurrentSession: number | null = null;

export function getStreamHealthSnapshot(): StreamHealthSnapshot {
  return { ...snapshot };
}

export function getLastInboundBeforeSession(): number | null {
  return lastInboundBeforeCurrentSession;
}

export function markConnecting(): void {
  snapshot = { ...snapshot, state: 'connecting', lastError: null };
}

export function markConnected(): void {
  const now = Date.now();
  snapshot = {
    ...snapshot,
    state: 'connected',
    connectedAt: now,
    lastError: null,
    reconnectAttempts: 0,
  };
}

export function recordInbound(): void {
  const now = Date.now();
  lastInboundBeforeCurrentSession = snapshot.lastInboundAt;
  snapshot = { ...snapshot, lastInboundAt: now };
}

export function markReconnecting(reason: StreamEndReason, error?: string): void {
  snapshot = {
    ...snapshot,
    state: 'reconnecting',
    connectedAt: null,
    lastReconnectAt: Date.now(),
    lastEndReason: reason,
    lastError: error ?? null,
    reconnectAttempts: snapshot.reconnectAttempts + 1,
  };
}

export function markFailed(error: string): void {
  snapshot = {
    ...snapshot,
    state: 'failed',
    connectedAt: null,
    lastError: error,
  };
}

export function markConnectFailed(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  snapshot = {
    ...snapshot,
    state: 'failed',
    connectedAt: null,
    lastError: message,
  };
}

// Default off: idle stale-recycle hammers Spectrum createClient (~48/day at 30m). Use STREAM_REFRESH_MS instead.
const STALE_MS = Number(process.env.STREAM_STALE_MS ?? process.env.STREAM_WATCHDOG_MS ?? 0);
const REFRESH_MS = Number(process.env.STREAM_REFRESH_MS ?? 6 * 60 * 60 * 1000);
const RECONNECT_UNHEALTHY_MS = Number(process.env.STREAM_RECONNECT_UNHEALTHY_MS ?? 120_000);

export function getStreamStaleMs(): number {
  return STALE_MS > 0 ? STALE_MS : 0;
}

export function getStreamRefreshMs(): number {
  return REFRESH_MS > 0 ? REFRESH_MS : 0;
}

/** True when the live connection should be recycled (no inbound for STALE_MS). */
export function isStreamStale(): boolean {
  if (STALE_MS <= 0 || snapshot.state !== 'connected' || !snapshot.connectedAt) return false;
  const anchor = snapshot.lastInboundAt ?? snapshot.connectedAt;
  return Date.now() - anchor >= STALE_MS;
}

/** Proactive reconnect even when messages still arrive (long-lived gRPC). */
export function isStreamRefreshDue(): boolean {
  if (REFRESH_MS <= 0 || snapshot.state !== 'connected' || !snapshot.connectedAt) return false;
  return Date.now() - snapshot.connectedAt >= REFRESH_MS;
}

export function getHealthResponse(): { statusCode: number; body: string } {
  const now = Date.now();
  const reconnectingFor = snapshot.lastReconnectAt ? now - snapshot.lastReconnectAt : 0;

  if (snapshot.state === 'connected') {
    return { statusCode: 200, body: 'ok' };
  }

  if (snapshot.state === 'connecting') {
    return { statusCode: 200, body: 'connecting' };
  }

  if (snapshot.state === 'failed') {
    return { statusCode: 503, body: `stream failed: ${snapshot.lastError ?? 'unknown'}` };
  }

  // reconnecting — only unhealthy if stuck retrying for a while
  if (reconnectingFor > RECONNECT_UNHEALTHY_MS) {
    return {
      statusCode: 503,
      body: `stream reconnecting (${Math.round(reconnectingFor / 1000)}s): ${snapshot.lastError ?? snapshot.lastEndReason ?? 'unknown'}`,
    };
  }

  return { statusCode: 200, body: 'reconnecting' };
}

export function startHealthServer(port: number): void {
  if (!Number.isFinite(port) || port <= 0) return;

  http
    .createServer((_req, res) => {
      const { statusCode, body } = getHealthResponse();
      res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(body);
    })
    .listen(port, '0.0.0.0', () => {
      console.log(`[health] listening on 0.0.0.0:${port}`);
    });
}
