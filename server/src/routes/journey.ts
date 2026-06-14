/**
 * Journey timeline - a horizontally-scrolling visual story of the creator's path
 * from where she started to now. Lives behind the Connection dimension on
 * the Reputation page. Each entry is a tag pinned to a date: a win, a
 * failure, a teaching moment, or a "version of me" avatar.
 *
 * Backed by 00_System/journey-timeline.json.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { abs } from '../vault.js';

const JOURNEY_FILE = abs('00_System', 'journey-timeline.json');
const IMAGE_DIR = abs('00_System', 'journey-images');

export type JourneyEntryType = 'win' | 'failure' | 'lesson' | 'avatar';

export interface JourneyEntry {
  id: string;
  date: string; // YYYY-MM (month precision is enough for a long arc)
  type: JourneyEntryType;
  title: string;
  body?: string;
  tags?: string[];
  // Legacy manual placement (older drags). When `vertical_offset` is set, it
  // wins. Kept here so existing entries keep rendering until re-dragged.
  side?: 'top' | 'bottom';
  lane?: number;
  // Free-form vertical position (px from centerline; negative=above, positive=below)
  vertical_offset?: number;
  // Optional image (URL or /api/journey/images/<name> for uploaded files).
  image_url?: string;
  created_at: number;
  updated_at: number;
}

export interface JourneyTimeline {
  start_date: string; // YYYY-MM - when the arc begins on the page
  entries: JourneyEntry[];
}

function defaultTimeline(): JourneyTimeline {
  const now = new Date();
  const year = now.getUTCFullYear() - 5;
  return { start_date: `${year}-01`, entries: [] };
}

function loadTimeline(): JourneyTimeline {
  try {
    if (!fs.existsSync(JOURNEY_FILE)) return defaultTimeline();
    const raw = fs.readFileSync(JOURNEY_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<JourneyTimeline>;
    return {
      start_date: parsed.start_date || defaultTimeline().start_date,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return defaultTimeline();
  }
}

function saveTimeline(t: JourneyTimeline): void {
  fs.mkdirSync(JOURNEY_FILE.replace(/\/[^/]+$/, ''), { recursive: true });
  fs.writeFileSync(JOURNEY_FILE, JSON.stringify(t, null, 2));
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function newId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

const VALID_TYPES: JourneyEntryType[] = ['win', 'failure', 'lesson', 'avatar'];

function normalizeDate(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const m = input.match(/^(\d{4})-(\d{1,2})/);
  if (!m) return null;
  const y = m[1];
  const mo = String(Math.min(12, Math.max(1, parseInt(m[2], 10)))).padStart(2, '0');
  return `${y}-${mo}`;
}

const app = new Hono();

app.get('/', (c) => {
  return c.json(loadTimeline());
});

app.patch('/', async (c) => {
  const body = (await c.req.json()) as { start_date?: string };
  const t = loadTimeline();
  if (body.start_date) {
    const d = normalizeDate(body.start_date);
    if (d) t.start_date = d;
  }
  saveTimeline(t);
  return c.json(t);
});

app.post('/entries', async (c) => {
  const body = (await c.req.json()) as Partial<JourneyEntry>;
  const date = normalizeDate(body.date);
  if (!date) return c.json({ error: 'invalid date (expected YYYY-MM)' }, 400);
  const type = VALID_TYPES.includes(body.type as JourneyEntryType)
    ? (body.type as JourneyEntryType)
    : 'lesson';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return c.json({ error: 'title required' }, 400);

  const entry: JourneyEntry = {
    id: newId(),
    date,
    type,
    title,
    body: typeof body.body === 'string' ? body.body.trim() || undefined : undefined,
    tags: Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string') : undefined,
    side: body.side === 'top' || body.side === 'bottom' ? body.side : undefined,
    lane: typeof body.lane === 'number' && body.lane >= 0 ? Math.floor(body.lane) : undefined,
    vertical_offset:
      typeof body.vertical_offset === 'number' && Number.isFinite(body.vertical_offset)
        ? Math.round(body.vertical_offset)
        : undefined,
    image_url: typeof body.image_url === 'string' ? body.image_url.trim() || undefined : undefined,
    created_at: nowSec(),
    updated_at: nowSec(),
  };

  const t = loadTimeline();
  t.entries.push(entry);
  saveTimeline(t);
  return c.json({ ok: true, entry });
});

app.patch('/entries/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as Partial<JourneyEntry>;
  const t = loadTimeline();
  const idx = t.entries.findIndex((e) => e.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const e = t.entries[idx];

  if (body.date !== undefined) {
    const d = normalizeDate(body.date);
    if (d) e.date = d;
  }
  if (body.type !== undefined && VALID_TYPES.includes(body.type as JourneyEntryType)) {
    e.type = body.type as JourneyEntryType;
  }
  if (body.title !== undefined && typeof body.title === 'string') {
    const v = body.title.trim();
    if (v) e.title = v;
  }
  if (body.body !== undefined) {
    if (typeof body.body === 'string') {
      const v = body.body.trim();
      e.body = v || undefined;
    } else if (body.body === null) {
      e.body = undefined;
    }
  }
  if (body.tags !== undefined) {
    e.tags = Array.isArray(body.tags)
      ? body.tags.filter((t) => typeof t === 'string')
      : undefined;
  }
  if (body.side !== undefined) {
    e.side = body.side === 'top' || body.side === 'bottom' ? body.side : undefined;
  }
  if (body.lane !== undefined) {
    e.lane =
      typeof body.lane === 'number' && body.lane >= 0 ? Math.floor(body.lane) : undefined;
  }
  if (body.vertical_offset !== undefined) {
    if (typeof body.vertical_offset === 'number' && Number.isFinite(body.vertical_offset)) {
      e.vertical_offset = Math.round(body.vertical_offset);
    } else if (body.vertical_offset === null) {
      e.vertical_offset = undefined;
    }
  }
  if (body.image_url !== undefined) {
    if (typeof body.image_url === 'string') {
      const v = body.image_url.trim();
      e.image_url = v || undefined;
    } else if (body.image_url === null) {
      e.image_url = undefined;
    }
  }
  e.updated_at = nowSec();
  t.entries[idx] = e;
  saveTimeline(t);
  return c.json({ ok: true, entry: e });
});

app.delete('/entries/:id', (c) => {
  const id = c.req.param('id');
  const t = loadTimeline();
  const before = t.entries.length;
  t.entries = t.entries.filter((e) => e.id !== id);
  if (t.entries.length === before) return c.json({ error: 'not found' }, 404);
  saveTimeline(t);
  return c.json({ ok: true });
});

// Upload an image: client sends { filename, data_b64 } (base64 without the
// data: prefix). Saved under 00_System/journey-images/. Returns a stable URL
// that the frontend can stuff into entry.image_url.
app.post('/upload-image', async (c) => {
  const body = (await c.req.json()) as { filename?: string; data_b64?: string };
  if (!body.data_b64 || typeof body.data_b64 !== 'string') {
    return c.json({ error: 'data_b64 required' }, 400);
  }
  const safe = (body.filename || 'image.png')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 60);
  const name = `${newId()}-${safe}`;
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  try {
    const buf = Buffer.from(body.data_b64, 'base64');
    fs.writeFileSync(path.join(IMAGE_DIR, name), buf);
  } catch {
    return c.json({ error: 'invalid base64' }, 400);
  }
  return c.json({ ok: true, url: `/api/journey/images/${name}` });
});

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

app.get('/images/:name', (c) => {
  const name = c.req.param('name');
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return c.json({ error: 'bad name' }, 400);
  const full = path.join(IMAGE_DIR, name);
  if (!fs.existsSync(full)) return c.json({ error: 'not found' }, 404);
  const ext = path.extname(full).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  const buf = fs.readFileSync(full);
  return new Response(buf, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

export default app;
