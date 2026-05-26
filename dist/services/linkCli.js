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
const DEFAULT_TIMEOUT_MS = Math.max(5_000, Math.min(120_000, Number.parseInt(process.env.LINK_CLI_TIMEOUT_MS ?? '60000', 10) || 60_000));
function redactSensitiveOutput(text) {
    return text
        .replace(/"number"\s*:\s*"\d{12,19}"/g, '"number":"[REDACTED]"')
        .replace(/"cvc"\s*:\s*"\d{3,4}"/g, '"cvc":"[REDACTED]"');
}
function parseLinkCliStdout(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed)
        return null;
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return { raw: trimmed };
    }
}
function extractCliError(parsed) {
    if (!parsed || typeof parsed !== 'object')
        return undefined;
    if ('code' in parsed && 'message' in parsed) {
        return {
            code: String(parsed.code ?? 'UNKNOWN'),
            message: String(parsed.message ?? 'Link CLI error'),
        };
    }
    if (Array.isArray(parsed) && parsed.length === 1) {
        const first = parsed[0];
        if (first && typeof first === 'object' && 'code' in first && 'message' in first) {
            return first;
        }
    }
    return undefined;
}
async function ensureAuthDir() {
    await mkdir(AUTH_DIR, { recursive: true, mode: 0o700 });
}
export function linkAuthPathForUser(userId) {
    return path.join(AUTH_DIR, `${userId}.json`);
}
export async function hydrateLinkAuthFile(userId) {
    const stored = await getLinkAuthJson(userId);
    if (!stored)
        return false;
    await ensureAuthDir();
    await writeFile(linkAuthPathForUser(userId), stored, { mode: 0o600 });
    return true;
}
export async function persistLinkAuthFile(userId) {
    try {
        const contents = await readFile(linkAuthPathForUser(userId), 'utf8');
        if (!contents.trim())
            return false;
        await setLinkAuthJson(userId, contents);
        return true;
    }
    catch {
        return false;
    }
}
export function isLinkCliInstalled() {
    return existsSync(CLI_BIN);
}
export async function runLinkCli(args, options) {
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
        const finish = (exitCode) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            const parsed = parseLinkCliStdout(stdout);
            const error = extractCliError(parsed);
            const ok = exitCode === 0 && !error;
            if (!ok) {
                console.warn(`[link-cli] failed args=${JSON.stringify(args)} exit=${exitCode} stderr=${stderr.slice(0, 200)} stdout=${redactSensitiveOutput(stdout).slice(0, 400)}`);
            }
            resolve({ ok, exitCode, stdout, stderr, parsed, error });
        };
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            finish(124);
        }, timeoutMs);
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', (err) => {
            stderr += err.message;
            finish(1);
        });
        child.on('close', (code) => finish(code ?? 1));
    });
}
export async function linkAuthStatus(userId) {
    return runLinkCli(['auth', 'status'], { userId });
}
export async function linkAuthLogin(userId) {
    return runLinkCli(['auth', 'login', '--client-name', CLIENT_NAME], { userId, timeoutMs: 30_000 });
}
export async function linkAuthPoll(userId, maxAttempts = 12) {
    const result = await runLinkCli(['auth', 'status', '--interval', '5', '--max-attempts', String(maxAttempts)], { userId, timeoutMs: maxAttempts * 5_000 + 10_000 });
    if (result.ok) {
        await persistLinkAuthFile(userId);
    }
    return result;
}
export async function linkPaymentMethodsList(userId) {
    return runLinkCli(['payment-methods', 'list'], { userId });
}
export async function linkShippingAddressList(userId) {
    return runLinkCli(['shipping-address', 'list'], { userId });
}
export function formatLinkAuthStatus(parsed) {
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!row || typeof row !== 'object') {
        return { authenticated: false };
    }
    return {
        authenticated: Boolean(row.authenticated),
        credentials_path: typeof row.credentials_path === 'string'
            ? row.credentials_path
            : undefined,
    };
}
export function formatLinkLoginResponse(parsed) {
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!row || typeof row !== 'object')
        return {};
    const r = row;
    return {
        verification_url: r.verification_url,
        phrase: r.phrase,
        instruction: r.instruction,
    };
}
