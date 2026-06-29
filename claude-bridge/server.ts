/**
 * Claude Code Bridge - a tiny HTTP service the dashboard server calls for
 * AI features instead of the Anthropic API directly.
 *
 * Listens on :8789. Two endpoints:
 *   POST /run  - one-shot { system, user, type, maxTokens, expectJson } →
 *                spawns `claude -p`, returns { text, model }.
 *   POST /chat - streaming, multi-turn chat. Spawns `claude -p` with the vault
 *                as cwd and streams partial text back as Server-Sent Events.
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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.BRIDGE_PORT ?? 8789);
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';
// The in-dashboard chat runs claude with the vault as its working directory so
// it can read and write the real vault files (and discover the vault's skills).
// One-shot AI features (/run) don't care about cwd. The launcher passes
// VAULT_ROOT; if it's unset, fall back to the bundled sample-vault next door.
const VAULT_ROOT =
  process.env.VAULT_ROOT ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sample-vault');

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

type ChatRequest = {
  sessionId: string;
  message: string;
  // false (or absent) for the first turn of a thread → claude creates the
  // session with --session-id. true thereafter → --resume picks it back up.
  resume?: boolean;
  // Optional extra system context layered on top of the vault's own CLAUDE.md.
  system?: string;
};

// Write one Server-Sent-Event frame. The frontend parses each `data:` line's
// JSON and switches on `.type` (delta | tool | status | done | error).
function sse(res: http.ServerResponse, obj: unknown) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

/**
 * Streaming, multi-turn chat against the member's Claude subscription.
 *
 * Unlike /run (one-shot, no tools matter, no session), the chat:
 *   - runs with the vault as cwd so claude can read/write real files,
 *   - keeps a session (so follow-up turns remember the conversation),
 *   - leaves slash-commands / skills enabled so "run the X skill" works,
 *   - streams partial text out as SSE as the model produces it.
 */
function handleChat(req: http.IncomingMessage, res: http.ServerResponse, body: ChatRequest) {
  const args: string[] = ['-p'];
  if (body.resume) {
    args.push('--resume', body.sessionId);
  } else {
    args.push('--session-id', body.sessionId);
  }
  if (body.system) {
    args.push('--append-system-prompt', body.system);
  }
  args.push(
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--dangerously-skip-permissions',
  );

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const started = Date.now();
  console.log(`[${timestamp()}] chat ${body.resume ? 'resume' : 'new'} ${body.sessionId.slice(0, 8)} (${body.message.length} chars)`);

  const child = spawn(CLAUDE_BIN, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: VAULT_ROOT,
    env: { ...process.env },
  });

  let stderr = '';
  let buf = '';
  let sawResult = false;

  // claude streams NDJSON: one JSON object per line. Chunks can split a line,
  // so we buffer and only parse on newline boundaries.
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.type === 'stream_event') {
        const ev = obj.event;
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          sse(res, { type: 'delta', text: ev.delta.text });
        } else if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
          sse(res, { type: 'tool', name: ev.content_block.name });
        } else if (ev?.type === 'content_block_start' && ev.content_block?.type === 'thinking') {
          sse(res, { type: 'status', label: 'thinking' });
        }
      } else if (obj.type === 'result') {
        sawResult = true;
        sse(res, {
          type: 'done',
          sessionId: obj.session_id,
          text: obj.result ?? '',
          costUsd: obj.total_cost_usd,
          numTurns: obj.num_turns,
          isError: !!obj.is_error,
        });
      }
    }
  });

  child.stderr.on('data', (d) => (stderr += d.toString()));

  child.on('error', (err) => {
    sse(res, { type: 'error', message: err.message });
    res.end();
  });

  child.on('close', (code) => {
    const durationMs = Date.now() - started;
    if (!sawResult) {
      const msg = code === 0
        ? 'claude closed without a result'
        : `claude exited ${code}: ${stderr.slice(0, 500)}`;
      console.error(`[${timestamp()}]   ↳ chat error: ${msg}`);
      sse(res, { type: 'error', message: msg });
    } else {
      console.log(`[${timestamp()}]   ↳ chat ok ${durationMs}ms`);
    }
    res.end();
  });

  // If the browser disconnects mid-stream, kill the child so we don't leak a
  // claude process churning tokens with nobody listening.
  req.on('close', () => {
    if (!child.killed) child.kill();
  });

  child.stdin.write(body.message);
  child.stdin.end();
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

  if (req.method === 'POST' && req.url === '/chat') {
    let body: ChatRequest;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `bad json body: ${err?.message || err}` }));
      return;
    }
    if (!body?.sessionId || !body?.message) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'sessionId and message are required' }));
      return;
    }
    handleChat(req, res, body);
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
  console.log(`  vault root: ${VAULT_ROOT}`);
  console.log(`  if requests fail with "Not logged in", run: claude auth login`);
});
