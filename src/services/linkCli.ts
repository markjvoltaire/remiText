import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLinkAuthJson, setLinkAuthJson } from './supabase.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER_DIR = path.join(REPO_ROOT, 'link-cli-runner');
const CLI_BIN = path.join(RUNNER_DIR, 'node_modules', '.bin', 'link-cli');

const AUTH_DIR = process.env.LINK_AUTH_DIR ?? path.join(REPO_ROOT, '.link-auth');
const CLIENT_NAME = process.env.LINK_CLI_CLIENT_NAME ?? 'Remi';
const DEFAULT_TIMEOUT_MS = Math.max(
  5_000,
  Math.min(120_000, Number.parseInt(process.env.LINK_CLI_TIMEOUT_MS ?? '60000', 10) || 60_000),
);

export interface LinkCliJsonError {
  code?: string;
  message?: string;
}

export interface LinkCliRunResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  parsed: unknown;
  error?: LinkCliJsonError;
}

function redactSensitiveOutput(text: string): string {
  return text
    .replace(/"number"\s*:\s*"\d{12,19}"/g, '"number":"[REDACTED]"')
    .replace(/"cvc"\s*:\s*"\d{3,4}"/g, '"cvc":"[REDACTED]"');
}

function parseLinkCliStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { raw: trimmed };
  }
}

function extractCliError(parsed: unknown): LinkCliJsonError | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  if ('code' in parsed && 'message' in parsed) {
    return {
      code: String((parsed as LinkCliJsonError).code ?? 'UNKNOWN'),
      message: String((parsed as LinkCliJsonError).message ?? 'Link CLI error'),
    };
  }
  if (Array.isArray(parsed) && parsed.length === 1) {
    const first = parsed[0];
    if (first && typeof first === 'object' && 'code' in first && 'message' in first) {
      return first as LinkCliJsonError;
    }
  }
  return undefined;
}

async function ensureAuthDir(): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true, mode: 0o700 });
}

export function linkAuthPathForUser(userId: string): string {
  return path.join(AUTH_DIR, `${userId}.json`);
}

export async function hydrateLinkAuthFile(userId: string): Promise<boolean> {
  const stored = await getLinkAuthJson(userId);
  if (!stored) return false;
  await ensureAuthDir();
  await writeFile(linkAuthPathForUser(userId), stored, { mode: 0o600 });
  return true;
}

export async function persistLinkAuthFile(userId: string): Promise<boolean> {
  try {
    const contents = await readFile(linkAuthPathForUser(userId), 'utf8');
    if (!contents.trim()) return false;
    await setLinkAuthJson(userId, contents);
    return true;
  } catch {
    return false;
  }
}

export function isLinkCliInstalled(): boolean {
  return existsSync(CLI_BIN);
}

export async function runLinkCli(
  args: string[],
  options?: { userId?: string; timeoutMs?: number },
): Promise<LinkCliRunResult> {
  if (!isLinkCliInstalled()) {
    return {
      ok: false,
      exitCode: 127,
      stdout: '',
      stderr: 'Link CLI runner is not installed. Run: cd link-cli-runner && npm install',
      parsed: {
        code: 'LINK_CLI_NOT_INSTALLED',
        message: 'Link CLI is not available on this server yet.',
      },
      error: {
        code: 'LINK_CLI_NOT_INSTALLED',
        message: 'Link CLI is not available on this server yet.',
      },
    };
  }

  if (options?.userId) {
    await hydrateLinkAuthFile(options.userId);
  }

  const authArgs = options?.userId ? ['--auth', linkAuthPathForUser(options.userId)] : [];
  const allArgs = [...args, ...authArgs, '--format', 'json'];
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const child = spawn(CLI_BIN, allArgs, {
      cwd: RUNNER_DIR,
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const parsed = parseLinkCliStdout(stdout);
      const error = extractCliError(parsed);
      const ok = exitCode === 0 && !error;
      if (!ok) {
        console.warn(
          `[link-cli] failed args=${JSON.stringify(args)} exit=${exitCode} stderr=${stderr.slice(0, 200)} stdout=${redactSensitiveOutput(stdout).slice(0, 400)}`,
        );
      }
      resolve({ ok, exitCode, stdout, stderr, parsed, error });
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(124);
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      stderr += err.message;
      finish(1);
    });
    child.on('close', (code) => finish(code ?? 1));
  });
}

export async function linkAuthStatus(userId: string): Promise<LinkCliRunResult> {
  return runLinkCli(['auth', 'status'], { userId });
}

export async function linkAuthLogin(userId: string): Promise<LinkCliRunResult> {
  return runLinkCli(['auth', 'login', '--client-name', CLIENT_NAME], { userId, timeoutMs: 30_000 });
}

export async function linkAuthPoll(userId: string, maxAttempts = 12): Promise<LinkCliRunResult> {
  const result = await runLinkCli(
    ['auth', 'status', '--interval', '5', '--max-attempts', String(maxAttempts)],
    { userId, timeoutMs: maxAttempts * 5_000 + 10_000 },
  );
  if (result.ok) {
    await persistLinkAuthFile(userId);
  }
  return result;
}

export async function linkPaymentMethodsList(userId: string): Promise<LinkCliRunResult> {
  return runLinkCli(['payment-methods', 'list'], { userId });
}

export async function linkShippingAddressList(userId: string): Promise<LinkCliRunResult> {
  return runLinkCli(['shipping-address', 'list'], { userId });
}

export function formatLinkAuthStatus(parsed: unknown): {
  authenticated: boolean;
  credentials_path?: string;
} {
  const row = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!row || typeof row !== 'object') {
    return { authenticated: false };
  }
  return {
    authenticated: Boolean((row as { authenticated?: boolean }).authenticated),
    credentials_path:
      typeof (row as { credentials_path?: string }).credentials_path === 'string'
        ? (row as { credentials_path: string }).credentials_path
        : undefined,
  };
}

export function formatLinkLoginResponse(parsed: unknown): {
  verification_url?: string;
  phrase?: string;
  instruction?: string;
} {
  const row = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!row || typeof row !== 'object') return {};
  const r = row as {
    verification_url?: string;
    phrase?: string;
    instruction?: string;
  };
  return {
    verification_url: r.verification_url,
    phrase: r.phrase,
    instruction: r.instruction,
  };
}
