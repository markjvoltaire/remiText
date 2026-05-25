/**
 * Human-readable, multi-line logs for each inbound message turn (Render-friendly).
 * Disable with REMI_SESSION_LOG=0.
 */

const SESSION_LOG_ENABLED = process.env.REMI_SESSION_LOG !== '0';

const TOOL_LOG_MAX_CHARS = Math.max(
  400,
  Math.min(
    20_000,
    Number.parseInt(process.env.REMI_TOOL_LOG_MAX_CHARS ?? '6000', 10) || 6000,
  ),
);

const USER_LOG_MAX_CHARS = Math.max(
  80,
  Math.min(2000, Number.parseInt(process.env.REMI_USER_LOG_MAX_CHARS ?? '800', 10) || 800),
);

const LINE = '─'.repeat(72);
const BANNER = '━'.repeat(72);

type TurnContext = {
  userId: string;
  messageId?: string;
  contactKey?: string;
  toolCount: number;
  modelRound: number;
};

let activeTurn: TurnContext | null = null;

function enabled(): boolean {
  return SESSION_LOG_ENABLED;
}

function indentBlock(text: string, prefix = '    '): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}\n… [${text.length - max} more chars]`, truncated: true };
}

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function formatValue(value: unknown, maxChars: number): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') {
    const { text } = truncate(value, maxChars);
    return text;
  }
  try {
    const pretty = JSON.stringify(value, null, 2);
    const { text } = truncate(pretty, maxChars);
    return text;
  } catch {
    const { text } = truncate(String(value), maxChars);
    return text;
  }
}

function summarizeToolResult(toolName: string, result: string, parsed: unknown | null): string[] {
  const lines: string[] = [];
  if (!parsed || typeof parsed !== 'object') {
    return lines;
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.error === true) {
    lines.push(`error: ${String(obj.message ?? obj.error ?? 'unknown')}`);
    if (obj.instant_only) lines.push('instant payment required (hold not available)');
    if (obj.stale_offer) lines.push('stale offer — fresh search included in result');
    if (obj.needs_vibe) lines.push('needs user vibe before social search');
    return lines;
  }

  switch (toolName) {
    case 'search_flights': {
      const offers = Array.isArray(obj.offers) ? obj.offers : [];
      lines.push(`${offers.length} offer(s) in result`);
      if (typeof obj.formatted === 'string' && obj.formatted.length > 0) {
        const preview = obj.formatted.split('\n').slice(0, 4).join(' · ');
        lines.push(`formatted: ${preview}${obj.formatted.includes('\n') ? ' …' : ''}`);
      }
      break;
    }
    case 'search_restaurants': {
      const venues = Array.isArray(obj.venues) ? obj.venues : [];
      lines.push(`${venues.length} venue(s)`);
      if (typeof obj.formatted === 'string' && obj.formatted.length > 0) {
        const firstLine = obj.formatted.split('\n')[0] ?? '';
        lines.push(`formatted: ${firstLine}${obj.formatted.includes('\n') ? ' …' : ''}`);
      }
      break;
    }
    case 'hold_flight':
    case 'book_flight':
    case 'confirm_booking': {
      if (typeof obj.message === 'string') lines.push(obj.message);
      if (obj.order_id) lines.push(`order_id: ${String(obj.order_id)}`);
      if (obj.offer_id) lines.push(`offer_id: ${String(obj.offer_id)}`);
      break;
    }
    case 'search_tiktok':
    case 'search_instagram': {
      const items = Array.isArray(obj.items) ? obj.items : [];
      lines.push(`${items.length} item(s), both_empty=${String(obj.both_empty ?? false)}`);
      if (typeof obj.fallback_message === 'string') {
        lines.push(`fallback: ${obj.fallback_message}`);
      }
      break;
    }
    case 'get_restaurant_availability':
    case 'book_restaurant_table':
    case 'list_restaurant_reservations':
    case 'cancel_restaurant_reservation': {
      if (typeof obj.message === 'string') lines.push(obj.message);
      if (Array.isArray(obj.slots)) lines.push(`${obj.slots.length} slot(s)`);
      if (Array.isArray(obj.reservations)) lines.push(`${obj.reservations.length} reservation(s)`);
      break;
    }
    default:
      break;
  }

  return lines;
}

export function sessionTurnStart(opts: {
  userId: string;
  messageId?: string;
  contactKey?: string;
  inboundText: string;
  agentInput?: string;
  historyCount?: number;
}): void {
  if (!enabled()) return;

  activeTurn = {
    userId: opts.userId,
    messageId: opts.messageId,
    contactKey: opts.contactKey,
    toolCount: 0,
    modelRound: 0,
  };

  const parts = [
    `user=${opts.userId.slice(0, 8)}`,
    opts.messageId ? `msg=${opts.messageId}` : null,
    opts.contactKey ? `from=${opts.contactKey}` : null,
  ].filter(Boolean);

  console.log(BANNER);
  console.log(`  TURN  ${parts.join('  ')}`);
  console.log(BANNER);

  const userBody =
    opts.agentInput && opts.agentInput !== opts.inboundText
      ? `inbound:\n${indentBlock(opts.inboundText, '      ')}\n    agent_input:\n${indentBlock(opts.agentInput, '      ')}`
      : indentBlock(truncate(opts.inboundText, USER_LOG_MAX_CHARS).text);

  console.log('  USER');
  console.log(userBody);

  if (opts.historyCount !== undefined) {
    console.log(`  CONTEXT  ${opts.historyCount} prior message(s) loaded`);
  }
}

export function sessionModelRound(opts: {
  round: number;
  stopReason: string;
  toolNames?: string[];
}): void {
  if (!enabled() || !activeTurn) return;
  activeTurn.modelRound = opts.round;

  const tools =
    opts.toolNames && opts.toolNames.length > 0 ? ` → ${opts.toolNames.join(', ')}` : '';
  console.log(`  MODEL  round=${opts.round}  stop=${opts.stopReason}${tools}`);
}

export function sessionToolLog(
  toolName: string,
  input: unknown,
  result: string,
  meta: { ok: boolean; durationMs: number; isError?: boolean },
): void {
  if (!enabled() || !activeTurn) return;

  activeTurn.toolCount += 1;
  const n = activeTurn.toolCount;
  const status = meta.isError ? 'ERROR' : meta.ok ? 'ok' : 'fail';

  console.log(LINE);
  console.log(`  TOOL #${n}  ${toolName}  (${status}, ${meta.durationMs}ms)`);

  console.log('  INPUT');
  console.log(indentBlock(formatValue(input, TOOL_LOG_MAX_CHARS)));

  const parsed = safeParseJson(result);
  const summary = summarizeToolResult(toolName, result, parsed);
  if (summary.length > 0) {
    console.log('  SUMMARY');
    for (const line of summary) {
      console.log(`    · ${line}`);
    }
  }

  console.log('  OUTPUT');
  const body = parsed !== null ? formatValue(parsed, TOOL_LOG_MAX_CHARS) : formatValue(result, TOOL_LOG_MAX_CHARS);
  console.log(indentBlock(body));
}

export function sessionAssistantLog(text: string, meta?: { attachments?: number }): void {
  if (!enabled()) return;

  const { text: body } = truncate(text, USER_LOG_MAX_CHARS * 2);
  const attach =
    meta?.attachments !== undefined ? `  (${text.length} chars, ${meta.attachments} attachment(s))` : '';

  console.log(LINE);
  console.log(`  ASSISTANT → user${attach}`);
  console.log(indentBlock(body));

  if (activeTurn) {
    console.log(
      `  TURN DONE  tools=${activeTurn.toolCount}  model_rounds=${activeTurn.modelRound || '—'}`,
    );
    console.log(BANNER);
    console.log('');
    activeTurn = null;
  }
}

export function sessionTurnAbort(reason: string): void {
  if (!enabled()) return;
  console.log(`  TURN ABORTED  ${reason}`);
  if (activeTurn) {
    console.log(BANNER);
    console.log('');
    activeTurn = null;
  }
}
