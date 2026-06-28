/**
 * Chat - the in-dashboard Claude chat (Eden-style).
 *
 * Two responsibilities:
 *
 * 1. POST /            - a thin SSE passthrough. The frontend POSTs here (single
 *                        origin, same as every other /api call) and we stream the
 *                        claude-bridge's /chat SSE frames straight back.
 *
 * 2. /threads/*        - saved chats, persisted as JSON files in the vault
 *                        (00_System/dashboard-chats/). The vault is the database,
 *                        so chats are just files like everything else.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { BRIDGE_URL } from '../lib/bridge.js';
import { VAULT_ROOT } from '../vault.js';

const app = new Hono();

// ─── 1. Streaming passthrough ───────────────────────────────────────────
const BRIDGE_CHAT_URL = BRIDGE_URL.replace(/\/run$/, '/chat');

app.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.sessionId || !body?.message) {
    return c.json({ error: 'sessionId and message are required' }, 400);
  }

  let bridgeRes: Response;
  try {
    bridgeRes = await fetch(BRIDGE_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    return c.json({ error: `claude-bridge unreachable: ${err?.message || err}` }, 502);
  }

  if (!bridgeRes.ok || !bridgeRes.body) {
    const detail = await bridgeRes.text().catch(() => '');
    return c.json({ error: `bridge error ${bridgeRes.status}: ${detail.slice(0, 300)}` }, 502);
  }

  return new Response(bridgeRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
});

// ─── 2. Saved threads ───────────────────────────────────────────────────
const CHATS_DIR = path.join(VAULT_ROOT, '00_System', 'dashboard-chats');

type StoredMsg = { role: 'user' | 'assistant'; content: string; hidden?: boolean };
type Thread = {
  id: string;
  title: string;
  sessionId: string;
  messages: StoredMsg[];
  createdAt: string;
  updatedAt: string;
};

function safeId(id: string): string | null {
  // Thread ids are uuids; reject anything with path separators.
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
}

function threadPath(id: string): string {
  return path.join(CHATS_DIR, `${id}.json`);
}

function readThread(id: string): Thread | null {
  try {
    return JSON.parse(fs.readFileSync(threadPath(id), 'utf8')) as Thread;
  } catch {
    return null;
  }
}

// List: lightweight metadata only, newest first.
app.get('/threads', (c) => {
  let files: string[];
  try {
    files = fs.readdirSync(CHATS_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return c.json({ items: [] });
  }
  const items = files
    .map((f) => readThread(f.replace(/\.json$/, '')))
    .filter((t): t is Thread => !!t)
    .map((t) => ({
      id: t.id,
      title: t.title || 'untitled chat',
      updatedAt: t.updatedAt,
      messageCount: t.messages.length,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return c.json({ items });
});

app.get('/threads/:id', (c) => {
  const id = safeId(c.req.param('id'));
  if (!id) return c.json({ error: 'bad id' }, 400);
  const thread = readThread(id);
  if (!thread) return c.json({ error: 'not found' }, 404);
  return c.json(thread);
});

// Upsert. Preserves createdAt; bumps updatedAt.
app.put('/threads/:id', async (c) => {
  const id = safeId(c.req.param('id'));
  if (!id) return c.json({ error: 'bad id' }, 400);
  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages)) return c.json({ error: 'messages required' }, 400);

  const existing = readThread(id);
  const now = new Date().toISOString();
  const messages: StoredMsg[] = body.messages
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role, content: m.content, ...(m.hidden ? { hidden: true } : {}) }));

  // Title from the first VISIBLE user message - never the hidden run command.
  const firstUser = messages.find((m) => m.role === 'user' && !m.hidden);
  const firstAssistant = messages.find((m) => m.role === 'assistant');
  const fallback = firstUser?.content || firstAssistant?.content || '';
  const title = (body.title && String(body.title).trim()) || existing?.title || (fallback ? fallback.slice(0, 60) : 'untitled chat');

  const thread: Thread = {
    id,
    title,
    sessionId: body.sessionId || existing?.sessionId || id,
    messages,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  fs.mkdirSync(CHATS_DIR, { recursive: true });
  fs.writeFileSync(threadPath(id), JSON.stringify(thread, null, 2), 'utf8');
  return c.json({ ok: true, id, title });
});

app.delete('/threads/:id', (c) => {
  const id = safeId(c.req.param('id'));
  if (!id) return c.json({ error: 'bad id' }, 400);
  try {
    fs.unlinkSync(threadPath(id));
  } catch {
    // already gone - fine
  }
  return c.json({ ok: true });
});

export default app;
