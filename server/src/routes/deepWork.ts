/**
 * Deep Work blocks - time entries stored as a JSONL log at:
 *   00_System/deep-work/blocks.jsonl
 *
 * Each line is one block: {id, label, task_id, category, started_at, ended_at, duration_sec, created_at}.
 * Append-only on start; on finish we rewrite to set ended_at + duration_sec.
 * On delete we filter out the matching id.
 *
 * pickable-tasks reads tasks via the vault and returns the same shape as the
 * old backend (in_progress + pending, this_week first).
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { abs, loadCollection, loadFile, saveFile } from '../vault.js';

const BLOCKS_DIR_REL = ['00_System', 'deep-work'] as const;
const BLOCKS_FILE_REL = ['00_System', 'deep-work', 'blocks.jsonl'] as const;

type Block = {
  id: string;
  label: string | null;
  task_id: string | null;
  category: string | null;
  started_at: number;
  ended_at: number | null;
  duration_sec: number | null;
  created_at: number;
};

function readBlocks(): Block[] {
  const filePath = abs(...BLOCKS_FILE_REL);
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const out: Block[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

function writeBlocks(blocks: Block[]) {
  fs.mkdirSync(abs(...BLOCKS_DIR_REL), { recursive: true });
  const data = blocks.map((b) => JSON.stringify(b)).join('\n') + (blocks.length ? '\n' : '');
  fs.writeFileSync(abs(...BLOCKS_FILE_REL), data, 'utf8');
}

function appendBlock(block: Block) {
  fs.mkdirSync(abs(...BLOCKS_DIR_REL), { recursive: true });
  fs.appendFileSync(abs(...BLOCKS_FILE_REL), JSON.stringify(block) + '\n', 'utf8');
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Day window resolution, in priority order:
//   1. `day_start` (Unix seconds) - authoritative, computed by the frontend
//      in the user's local TZ. Window = [day_start, day_start + 86400).
//   2. `date` (YYYY-MM-DD) - legacy/fallback, parsed as local-time midnight.
//   3. Neither - "now": local midnight to "no end" (still-running blocks).
// Sending day_start makes the backend completely TZ-agnostic.
function startOfDay(
  date?: string,
  dayStartParam?: string
): { start: number; end: number | null } {
  const dayStart = dayStartParam ? Number(dayStartParam) : NaN;
  if (Number.isFinite(dayStart) && dayStart > 0) {
    return { start: Math.floor(dayStart), end: Math.floor(dayStart) + 86400 };
  }
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const startMs = new Date(`${date}T00:00:00`).getTime();
    return { start: Math.floor(startMs / 1000), end: Math.floor((startMs + 24 * 3600 * 1000) / 1000) };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return { start: Math.floor(today.getTime() / 1000), end: null };
}

// Lookup map task_id -> {title, status, category} so blocks linked to tasks
// can show those fields in the activity tracker.
function buildTaskLookup(): Record<string, { title: string; status: string; category: string }> {
  const out: Record<string, { title: string; status: string; category: string }> = {};
  for (const e of loadCollection('00_System/tasks', { type: 'task' })) {
    const fm = e.frontmatter as any;
    const titleMatch = e.body.match(/^#\s+(.+?)\s*$/m);
    const title = fm.title ?? (titleMatch ? titleMatch[1] : e.id);
    out[fm.id ?? e.id] = {
      title,
      status: fm.status ?? 'pending',
      category: fm.category ?? 'other',
    };
  }
  return out;
}

function enrichBlock(b: Block, taskLookup: Record<string, { title: string; status: string; category: string }>) {
  const linked = b.task_id ? taskLookup[b.task_id] : undefined;
  return {
    ...b,
    task_title: linked?.title ?? null,
    task_status: linked?.status ?? null,
    category: b.category ?? linked?.category ?? 'other',
  };
}

const app = new Hono();

// GET /api/deep-work/today (optionally ?date=YYYY-MM-DD)
app.get('/today', (c) => {
  const date = c.req.query('date');
  const dayStartParam = c.req.query('day_start');
  const { start, end } = startOfDay(date, dayStartParam);
  const all = readBlocks();
  const taskLookup = buildTaskLookup();
  const completed = all
    .filter((b) => b.ended_at !== null && b.started_at >= start && (end === null || b.started_at < end))
    .sort((a, b) => b.started_at - a.started_at)
    .map((b) => enrichBlock(b, taskLookup));
  // An "active" block is one with no ended_at that started inside this day's
  // window. The day's window is [start, end) when end is bounded, or
  // [start, infinity) when looking at today without an upper bound.
  const active = all.find(
    (b) =>
      b.ended_at === null &&
      b.started_at >= start &&
      (end === null || b.started_at < end)
  ) ?? null;
  const total = completed.reduce((acc, b) => acc + (b.duration_sec ?? 0), 0);

  // Tasks ticked during the day window - shown alongside started/finished
  // blocks in the activity feed.
  // For matching task completed_at (which is a YYYY-MM-DD string), derive the
  // day from `start`. This guarantees it matches the timestamp window above.
  const dayStr = localYmd(new Date(start * 1000));
  const tickedTasks: Array<{ id: string; title: string; category: string | null; energy: string | null; completed_at: number }> = [];
  for (const e of loadCollection('00_System/tasks', { type: 'task' })) {
    const fm = e.frontmatter as any;
    if (fm.status !== 'completed') continue;
    if (fm.completed_at !== dayStr) continue;
    const titleMatch = e.body.match(/^#\s+(.+?)\s*$/m);
    const completedSec = Math.floor(new Date(`${dayStr}T12:00:00Z`).getTime() / 1000);
    tickedTasks.push({
      id: fm.id ?? e.id,
      title: titleMatch ? titleMatch[1]! : e.id,
      category: fm.category ?? 'other',
      energy: fm.energy ?? null,
      completed_at: completedSec,
    });
  }

  return c.json({
    items: completed,
    completed: completed.length,
    active: active ? enrichBlock(active, taskLookup) : null,
    total_seconds: total,
    ticked_tasks: tickedTasks,
  });
});

// GET /api/deep-work/all (last 500)
app.get('/all', (c) => {
  const all = readBlocks().sort((a, b) => b.started_at - a.started_at).slice(0, 500);
  const taskLookup = buildTaskLookup();
  return c.json({ items: all.map((b) => enrichBlock(b, taskLookup)) });
});

// GET /api/deep-work/pickable-tasks - tasks the user can timebox.
app.get('/pickable-tasks', (c) => {
  const items: Array<{ id: string; title: string; status: string; category: string; this_week: number; project_id: string | null }> = [];
  for (const e of loadCollection('00_System/tasks', { type: 'task' })) {
    const fm = e.frontmatter as any;
    if (fm.status === 'completed') continue;
    const titleMatch = e.body.match(/^#\s+(.+?)\s*$/m);
    items.push({
      id: fm.id ?? e.id,
      title: titleMatch ? titleMatch[1] : e.id,
      status: fm.status ?? 'pending',
      category: fm.category ?? 'other',
      this_week: fm.this_week ? 1 : 0,
      project_id: fm.project ?? null,
    });
  }
  items.sort((a, b) => {
    if (a.this_week !== b.this_week) return b.this_week - a.this_week;
    const order: Record<string, number> = { in_progress: 0, pending: 1 };
    return (order[a.status] ?? 99) - (order[b.status] ?? 99);
  });
  return c.json({ items });
});

// POST /api/deep-work/start
app.post('/start', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    label?: string;
    task_id?: string;
    category?: string;
  };
  // If task_id given, pull title/category from the task file.
  let label = body.label ?? null;
  let category = body.category ?? null;
  const taskId = body.task_id ?? null;
  if (taskId) {
    const taskFile = loadFile(abs('00_System', 'tasks', `${taskId}.md`));
    if (taskFile) {
      const fm = taskFile.frontmatter as any;
      const titleMatch = taskFile.body.match(/^#\s+(.+?)\s*$/m);
      label = label ?? (titleMatch ? titleMatch[1] : taskId);
      category = category ?? (fm.category ?? 'other');
      // Bump status to in_progress.
      saveFile(taskFile.path, { ...fm, status: 'in_progress', updated: localYmd(new Date()) }, taskFile.body);
    }
  }
  // Close any active block first (idempotent guard).
  const all = readBlocks();
  const now = nowSec();
  const active = all.find((b) => b.ended_at === null);
  if (active) {
    active.ended_at = now;
    active.duration_sec = Math.max(0, now - active.started_at);
    writeBlocks(all);
  }
  const block: Block = {
    id: crypto.randomUUID(),
    label,
    task_id: taskId,
    category,
    started_at: now,
    ended_at: null,
    duration_sec: null,
    created_at: now,
  };
  appendBlock(block);
  return c.json(block);
});

// POST /api/deep-work/:id/finish
app.post('/:id/finish', (c) => {
  const id = c.req.param('id');
  const all = readBlocks();
  const idx = all.findIndex((b) => b.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const block = all[idx]!;
  if (block.ended_at === null) {
    const now = nowSec();
    block.ended_at = now;
    block.duration_sec = Math.max(0, now - block.started_at);
    writeBlocks(all);
  }
  return c.json(block);
});

// POST /api/deep-work/log - record a completed block with explicit times.
// Used when the user adds a duration to a ticked task after the fact, or
// otherwise logs work they didn't time live.
app.post('/log', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    label?: string;
    task_id?: string;
    category?: string;
    started_at?: number;
    ended_at?: number;
  } | null;
  if (!body || typeof body.started_at !== 'number' || typeof body.ended_at !== 'number') {
    return c.json({ error: 'started_at and ended_at (unix seconds) required' }, 400);
  }
  if (body.ended_at < body.started_at) {
    return c.json({ error: 'ended_at must be >= started_at' }, 400);
  }
  let label = body.label ?? null;
  let category = body.category ?? null;
  const taskId = body.task_id ?? null;
  if (taskId) {
    const taskFile = loadFile(abs('00_System', 'tasks', `${taskId}.md`));
    if (taskFile) {
      const fm = taskFile.frontmatter as any;
      const titleMatch = taskFile.body.match(/^#\s+(.+?)\s*$/m);
      label = label ?? (titleMatch ? titleMatch[1] : taskId);
      category = category ?? (fm.category ?? 'other');
    }
  }
  const block: Block = {
    id: crypto.randomUUID(),
    label,
    task_id: taskId,
    category,
    started_at: body.started_at,
    ended_at: body.ended_at,
    duration_sec: body.ended_at - body.started_at,
    created_at: nowSec(),
  };
  appendBlock(block);
  return c.json(block);
});

// PATCH /api/deep-work/target { seconds }
// Must be registered BEFORE the /:id routes - otherwise Hono treats "target"
// as a block id and the request 404s.
app.patch('/target', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { seconds?: number } | null;
  const seconds = typeof body?.seconds === 'number' ? Math.max(0, Math.round(body.seconds)) : null;
  if (seconds === null) return c.json({ error: 'seconds required' }, 400);
  const filePath = abs('00_System', 'state.md');
  const existing = loadFile(filePath);
  const fm = { ...(existing?.frontmatter ?? {}), deep_work_target_seconds: seconds, updated: new Date().toISOString() };
  saveFile(
    filePath,
    fm as Record<string, unknown>,
    existing?.body ?? '# Dashboard State\n\nAggregate metrics for the dashboard.\n'
  );
  return c.json({ ok: true, seconds });
});

// DELETE /api/deep-work/:id - remove a block
app.delete('/:id', (c) => {
  const id = c.req.param('id');
  const all = readBlocks();
  const next = all.filter((b) => b.id !== id);
  if (next.length === all.length) return c.json({ error: 'not found' }, 404);
  writeBlocks(next);
  return c.json({ ok: true });
});

// PATCH /api/deep-work/:id - edit a block's start/end times and/or category.
// Body: { started_at?, ended_at?, category? }. ended_at can be null.
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as {
    started_at?: number;
    ended_at?: number | null;
    category?: string | null;
  } | null;
  if (!body) return c.json({ error: 'body required' }, 400);
  const all = readBlocks();
  const idx = all.findIndex((b) => b.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const block = all[idx]!;
  const started_at = typeof body.started_at === 'number' ? body.started_at : block.started_at;
  const ended_at =
    body.ended_at === null ? null : typeof body.ended_at === 'number' ? body.ended_at : block.ended_at;
  if (typeof started_at !== 'number' || started_at <= 0) {
    return c.json({ error: 'invalid started_at' }, 400);
  }
  if (ended_at !== null && ended_at < started_at) {
    return c.json({ error: 'ended_at must be after started_at' }, 400);
  }
  block.started_at = started_at;
  block.ended_at = ended_at;
  block.duration_sec = ended_at == null ? null : ended_at - started_at;
  if (typeof body.category === 'string') {
    block.category = body.category;
  }
  writeBlocks(all);
  return c.json(block);
});

// Mark fs/path used (helps with strict TS unused checks on bare imports).
void fs;
void path;

export default app;
