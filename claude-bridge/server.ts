/**
 * Claude Code Bridge - a tiny HTTP service the dashboard server calls for
 * AI features instead of the Anthropic API directly.
 *
 * Listens on :8788. POST /run with { system, user, type, maxTokens, expectJson }.
 * Spawns `claude -p` on stdin, captures stdout, returns it as { text, model }.
 *
 * Uses your Claude Code subscription instead of metered API spend.
 *
 * Auth: relies on `claude auth login` having been run once. The bridge
 * doesn't store credentials itself - it just shells out to the CLI.
 *
 * The claude binary location can be overridden with the CLAUDE_BIN env var.
 * Defaults to `claude` on PATH.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.BRIDGE_PORT ?? 8789);
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';

type RunRequest = {
  type: string;
  system: string;
  user: string;
  maxTokens?: number;
  expectJson?: boolean;
};

type RunResponse = {
  text?: string;
  model?: string;
  error?: string;
  durationMs?: number;
};

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function timestamp() {
  return new Date().toISOString().slice(11, 19);
}

function runClaude(opts: RunRequest): Promise<{ stdout: string; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const args: string[] = [
      '-p',
      // Hand the system prompt via --append-system-prompt rather than
      // baking it into stdin so claude treats it as system context.
      '--append-system-prompt',
      opts.system,
      // Skip the workspace trust dialog (we're in our own dashboard repo).
      '--dangerously-skip-permissions',
      // Skip slash commands so /skill-name etc. don't get auto-invoked from
      // the prompt content.
      '--disable-slash-commands',
      // Skip resuming - each call is a one-shot.
      '--no-session-persistence',
      '--output-format',
      opts.expectJson ? 'json' : 'text',
    ];

    const started = Date.now();
    const child = spawn(CLAUDE_BIN, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      const durationMs = Date.now() - started;
      if (code === 0) {
        resolve({ stdout, durationMs });
      } else {
        reject(
          new Error(
            `claude -p exited ${code} after ${durationMs}ms: ${stderr.slice(0, 500) || stdout.slice(0, 500)}`
          )
        );
      }
    });

    // Send the user message via stdin
    child.stdin.write(opts.user);
    child.stdin.end();
  });
}

// If --output-format=json was requested, claude returns a JSON envelope like
// { type, subtype, result, ... }. Extract `result` so the caller sees just
// the actual text output, same shape as anthropic.messages.create returns.
function extractText(raw: string, expectJson: boolean): string {
  const trimmed = raw.trim();
  if (!expectJson) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object' && typeof parsed.result === 'string') {
      return parsed.result;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, claude_bin: CLAUDE_BIN }));
    return;
  }

  if (req.method === 'POST' && req.url === '/run') {
    let body: RunRequest;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `bad json body: ${err?.message || err}` } satisfies RunResponse));
      return;
    }

    if (!body?.system || !body?.user) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'system and user fields are required' } satisfies RunResponse));
      return;
    }

    console.log(`[${timestamp()}] running ${body.type ?? 'unknown'} (${body.user.length} chars user)`);
    try {
      const { stdout, durationMs } = await runClaude(body);
      const text = extractText(stdout, body.expectJson ?? false);
      console.log(`[${timestamp()}]   ↳ ok ${durationMs}ms (${text.length} chars output)`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          text,
          model: 'claude-code',
          durationMs,
        } satisfies RunResponse)
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error(`[${timestamp()}]   ↳ error: ${msg}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg } satisfies RunResponse));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

// Diagnose silent crashes: every node-level error gets logged before the
// process exits, with explicit stderr flushing so we actually see why the
// bridge died instead of just an "empty reply" downstream.
process.on('uncaughtException', (err) => {
  process.stderr.write(`[${timestamp()}] uncaughtException: ${err.stack || err.message || String(err)}\n`);
});
process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[${timestamp()}] unhandledRejection: ${(reason as any)?.stack || String(reason)}\n`);
});

server.listen(PORT, () => {
  console.log(`claude-bridge listening on http://localhost:${PORT}`);
  console.log(`  claude binary: ${CLAUDE_BIN}`);
  console.log(`  if requests fail with "Not logged in", run: claude auth login`);
});
