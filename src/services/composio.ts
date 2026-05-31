import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';

type ComposioClient = Composio<AnthropicProvider>;

let client: ComposioClient | null = null;

export function isComposioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim());
}

export function getComposioClient(): ComposioClient {
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
export function composioUserId(userId: string): string {
  return `remi-${userId}`;
}

export interface ComposioToolResult {
  successful?: boolean;
  success?: boolean;
  data?: unknown;
  error?: string;
}

export async function executeComposioTool(
  slug: string,
  userId: string,
  arguments_: Record<string, unknown>,
): Promise<ComposioToolResult> {
  const composio = getComposioClient();
  const raw = await composio.tools.execute(slug, {
    userId: composioUserId(userId),
    arguments: arguments_,
  });
  return raw as ComposioToolResult;
}

export function parseComposioData(result: ComposioToolResult): unknown {
  const { data } = result;
  if (data == null) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown;
    } catch {
      return data;
    }
  }
  return data;
}

export function composioResultOk(result: ComposioToolResult): boolean {
  if (result.successful === false || result.success === false) return false;
  if (result.error) return false;
  return true;
}
