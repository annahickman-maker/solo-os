/**
 * Nano Banana (Google Gemini image model) connection.
 *
 * The avatar image generator (and the youtube-thumbnail skill) use Google's
 * Nano Banana (gemini-2.5-flash-image) and read the key from
 * 04_Channel/00_System/system_config.md as a `GEMINI_API_KEY: <value>` line.
 * This route lets the Settings "connect your apps" card report status and lets
 * the connect-nano-banana setup skill save + test a key the user pastes in.
 *
 * Everything stays on the user's machine - the key is written to a local vault
 * file and only ever sent to Google's API to generate images.
 */
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { abs } from '../vault.js';

const app = new Hono();

const CONFIG_REL = ['04_Channel', '00_System', 'system_config.md'] as const;
const KEY_LINE_RE = /^\s*GEMINI_API_KEY:\s*(\S+)\s*$/m;

function readKey(): string {
  try {
    const cfg = fs.readFileSync(abs(...CONFIG_REL), 'utf8');
    const m = cfg.match(KEY_LINE_RE);
    if (m) return m[1]!.trim();
  } catch {}
  return '';
}

// GET /api/nano-banana/status - is a Gemini key saved?
app.get('/status', (c) => {
  const key = readKey();
  return c.json({
    connected: key.length > 0,
    key_preview: key ? `...${key.slice(-4)}` : null,
  });
});

// POST /api/nano-banana/key { key } - test the key against the image model,
// then save it into system_config.md (update the line in place if present,
// else append; create the file/dirs if missing).
app.post('/key', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const key = String((body as any)?.key ?? '').trim();
  if (!key) return c.json({ error: 'no key provided' }, 400);

  // Test it with one tiny generation so we never save a key that does not work.
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'A plain light grey square. Square 1:1. No text.' }] }] }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: `key test failed (gemini ${res.status}): ${errText.slice(0, 300)}` }, 400);
    }
    const data: any = await res.json();
    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    if (!parts.some((p) => p?.inlineData?.data)) {
      return c.json({ error: 'key test failed: the model returned no image. The key may not have image generation access.' }, 400);
    }
  } catch (err: any) {
    return c.json({ error: `key test failed: ${err?.message || String(err)}` }, 400);
  }

  // Save into 04_Channel/00_System/system_config.md.
  const file = abs(...CONFIG_REL);
  let content = '';
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {}
  const line = `GEMINI_API_KEY: ${key}`;
  if (KEY_LINE_RE.test(content)) {
    content = content.replace(KEY_LINE_RE, line);
  } else {
    content = content.trimEnd();
    content = content ? `${content}\n${line}\n` : `${line}\n`;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  } catch (err: any) {
    return c.json({ error: `could not save key: ${err?.message || String(err)}` }, 500);
  }

  return c.json({ ok: true, key_preview: `...${key.slice(-4)}` });
});

export default app;
