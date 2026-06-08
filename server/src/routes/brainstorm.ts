/**
 * Brainstorm - 246 seed questions with editable answers.
 *
 * Seed lives in code (lib/brainstormSeed.ts). User-edited state (answers,
 * completed flags, deletions) lives in 00_System/brainstorm-state.json.
 *
 * Serve = merge seed + state. Edits only touch the state file.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { abs } from '../vault.js';
import { QUESTIONS } from '../lib/brainstormSeed.js';

const STATE_FILE_REL = ['00_System', 'brainstorm-state.json'] as const;

type State = Record<string, { answer?: string | null; completed?: 0 | 1; deleted?: 0 | 1; updated_at?: number }>;

function loadState(): State {
  try {
    return JSON.parse(fs.readFileSync(abs(...STATE_FILE_REL), 'utf8')) as State;
  } catch {
    return {};
  }
}

function saveState(state: State): void {
  const file = abs(...STATE_FILE_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

function buildItems(state: State, opts: { includeDeleted?: boolean } = {}) {
  const items = QUESTIONS.map((q) => {
    const id = `q-${q.number}`;
    const s = state[id] ?? {};
    return {
      id,
      number: q.number,
      bucket: q.bucket,
      sub_category: q.sub_category,
      text: q.text,
      answer: s.answer ?? null,
      completed: s.completed ?? 0,
      deleted: s.deleted ?? 0,
      completed_at: s.completed ? s.updated_at ?? null : null,
      created_at: s.updated_at ?? null,
      updated_at: s.updated_at ?? null,
    };
  });
  return opts.includeDeleted ? items : items.filter((x) => !x.deleted);
}

const app = new Hono();

app.get('/', (c) => {
  const state = loadState();
  const all = buildItems(state, { includeDeleted: true });
  const visible = all.filter((x) => !x.deleted);
  return c.json({
    items: visible,
    total_active: visible.filter((x) => !x.completed).length,
    completed_count: visible.filter((x) => x.completed).length,
  });
});

app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  if (!QUESTIONS.find((q) => `q-${q.number}` === id)) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as
    | { answer?: string | null; completed?: 0 | 1 | boolean }
    | null;
  if (!body) return c.json({ error: 'body required' }, 400);
  const state = loadState();
  const prev = state[id] ?? {};
  const next = {
    ...prev,
    ...(body.answer !== undefined ? { answer: body.answer } : {}),
    ...(body.completed !== undefined ? { completed: (body.completed ? 1 : 0) as 0 | 1 } : {}),
    updated_at: Math.floor(Date.now() / 1000),
  };
  state[id] = next;
  saveState(state);
  return c.json({ ok: true, id, ...next });
});

/**
 * POST /:id/to-bank - take the answered question + its answer and create a
 * bank entry of the chosen dim. Mirrors the routing in extracts.ts.
 *
 * body: { dim: 'pov' | 'value' | 'authority' | 'connection' }
 * returns: { ok: true, dim, path, bank_id? }
 */
const POVS_DIR = abs('05_Assets', 'POVs');
// Bank JSONs live at 00_System/ - same paths as extracts.ts uses so they
// flow into the picker via loadAllBanks() in youtubeScriptBuilder.
const FRAMEWORKS_BANK = abs('00_System', 'teaching-frameworks.json');
const PROOF_BANK = abs('00_System', 'proof-points.json');
const MICRO_STORIES = abs('00_System', 'micro-stories.json');

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function appendJsonBank(filePath: string, entry: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let arr: any[] = [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    arr = JSON.parse(raw);
    if (!Array.isArray(arr)) arr = [];
  } catch {}
  arr.push(entry);
  fs.writeFileSync(filePath, JSON.stringify(arr, null, 2));
}

app.post('/:id/to-bank', async (c) => {
  const id = c.req.param('id');
  const q = QUESTIONS.find((x) => `q-${x.number}` === id);
  if (!q) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as { dim?: 'pov' | 'value' | 'authority' | 'connection' } | null;
  const dim = body?.dim;
  if (!dim || !['pov', 'value', 'authority', 'connection'].includes(dim)) {
    return c.json({ error: 'dim must be pov | value | authority | connection' }, 400);
  }
  const state = loadState();
  const answer = (state[id]?.answer ?? '').trim();
  if (!answer) return c.json({ error: 'question has no saved answer yet' }, 400);
  const now = Math.floor(Date.now() / 1000);
  // The prompt text is useful context (= what she was answering).
  const promptContext = q.text;

  if (dim === 'pov') {
    fs.mkdirSync(POVS_DIR, { recursive: true });
    const slug = `pov-${slugify(promptContext.split(/[.?!]/)[0] ?? 'brainstorm')}`.slice(0, 70);
    const filename = `asset_${slug}.md`;
    const filePath = path.join(POVS_DIR, filename);
    const today = new Date().toISOString().slice(0, 10);
    const titleText = (promptContext.slice(0, 60)).replace(/"/g, '\\"');
    const md =
      '---\n' +
      'type: pov\n' +
      `slug: ${slug}\n` +
      'status: draft\n' +
      'tags:\n  - type/asset\n  - domain/povs\n  - source/brainstorm\n' +
      'aliases:\n' +
      `  - "${titleText}"\n` +
      `id: ${slug}\n` +
      `title: "${titleText}"\n` +
      `created: '${today}'\n` +
      `updated: '${today}'\n` +
      `source_brainstorm_id: ${id}\n` +
      '---\n\n' +
      '## POV\n\n' +
      `${answer}\n\n` +
      '## Prompt\n\n' +
      `${promptContext}\n`;
    fs.writeFileSync(filePath, md);
    return c.json({ ok: true, dim, path: filePath });
  }

  const bankId =
    dim === 'value' ? `tf-${now}-${Math.random().toString(36).slice(2, 6)}` :
    dim === 'connection' ? `ms-${now}-${Math.random().toString(36).slice(2, 6)}` :
    `pc-${now}-${Math.random().toString(36).slice(2, 6)}`;
  const bankPath =
    dim === 'value' ? FRAMEWORKS_BANK :
    dim === 'connection' ? MICRO_STORIES :
    PROOF_BANK;
  appendJsonBank(bankPath, {
    id: bankId,
    text: answer,
    title: promptContext.slice(0, 80),
    context: promptContext,
    source_brainstorm_id: id,
    tags: [],
    status: 'confirmed',
    created_at: now,
    updated_at: now,
  });
  return c.json({ ok: true, dim, path: bankPath, bank_id: bankId });
});

app.delete('/:id', (c) => {
  const id = c.req.param('id');
  if (!QUESTIONS.find((q) => `q-${q.number}` === id)) return c.json({ error: 'not found' }, 404);
  const state = loadState();
  state[id] = { ...(state[id] ?? {}), deleted: 1, updated_at: Math.floor(Date.now() / 1000) };
  saveState(state);
  return c.json({ ok: true });
});

export default app;
