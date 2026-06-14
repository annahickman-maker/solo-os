/**
 * Reputation - file-based versions of the page state's PATCH/POST endpoints.
 *
 * Storage:
 *   - brand profile slots / self-ratings -> 00_System/state.md frontmatter
 *   - POVs                                -> 05_Assets/POVs/<id>.md (sections)
 *   - micro-stories bank                  -> 00_System/micro-stories.json
 *   - wins bank                           -> 00_System/wins.json
 *
 * The main GET /api/reputation (1200 lines of dimension scoring) still
 * proxies until I have time to port it. New POVs/wins added via the
 * Reputation page now land in the vault though.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { abs, loadFile, saveFile, slugify } from '../vault.js';
import {
  loadCachedAnalysis,
  runContentAnalysis,
  currentSampleSize,
} from '../lib/contentAnalysis.js';
import { buildReputationResponse } from '../lib/reputationPage.js';

const app = new Hono();

// ─── Main page state (now native) ──────────────────────────────────────────

app.get('/', (c) => {
  return c.json(buildReputationResponse());
});

// ─── Content analysis (already native, claude-driven) ──────────────────────

app.get('/content-analysis', (c) => {
  const cached = loadCachedAnalysis();
  return c.json({ analysis: cached, current_sample_size: currentSampleSize() });
});

app.post('/content-analysis/refresh', async (c) => {
  try {
    const result = await runContentAnalysis();
    return c.json({ analysis: result });
  } catch (err: any) {
    console.error('content analysis failed:', err);
    return c.json({ error: err?.message ?? 'content analysis failed' }, 500);
  }
});

// ─── Brand profile slots + self-ratings (state.md frontmatter) ─────────────

function getStateFm(): Record<string, unknown> {
  return (loadFile(abs('00_System', 'state.md'))?.frontmatter as Record<string, unknown>) ?? {};
}
function setStateField(field: string, value: unknown): void {
  const filePath = abs('00_System', 'state.md');
  const existing = loadFile(filePath);
  const fm = { ...(existing?.frontmatter ?? {}), [field]: value, updated: new Date().toISOString() };
  saveFile(
    filePath,
    fm as Record<string, unknown>,
    existing?.body ?? '# Dashboard State\n\nAggregate metrics for the dashboard.\n'
  );
}

app.patch('/slots', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { slot?: string; value?: string | null }
    | null;
  if (!body?.slot) return c.json({ error: 'slot required' }, 400);
  // Store under a `slot_<name>` prefix so we don't collide with other state.
  setStateField(`slot_${body.slot}`, body.value ?? null);
  return c.json({ ok: true });
});

app.patch('/ratings', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { slot?: string; score?: number }
    | null;
  if (!body?.slot || typeof body.score !== 'number') {
    return c.json({ error: 'slot + score (1-5) required' }, 400);
  }
  const score = Math.max(1, Math.min(5, Math.round(body.score)));
  setStateField(`rating_${body.slot}`, score);
  return c.json({ ok: true });
});

/**
 * Pin / unpin a proof item (a win or authority bank entry) to The Promise.
 * Persists the set as slot_pinned_proof_ids (array of strings) in state.md.
 *
 * body: { id: string, pinned: boolean }
 */
app.patch('/proof-pin', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { id?: string; pinned?: boolean } | null;
  if (!body?.id || typeof body.pinned !== 'boolean') {
    return c.json({ error: 'id (string) + pinned (boolean) required' }, 400);
  }
  const fm = getStateFm();
  const raw = fm.slot_pinned_proof_ids;
  const current: string[] = Array.isArray(raw)
    ? (raw as unknown[]).filter((x) => typeof x === 'string') as string[]
    : typeof raw === 'string' && raw.length > 0
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const set = new Set(current);
  if (body.pinned) set.add(body.id);
  else set.delete(body.id);
  setStateField('slot_pinned_proof_ids', [...set]);
  return c.json({ ok: true, pinned_proof_ids: [...set] });
});

// Story actions checklist (Connection dim). Each action is persisted as a
// slot_story_<id> field in state.md frontmatter ('1' = done).
app.patch('/story-actions/:id', async (c) => {
  const rawId = c.req.param('id');
  // Strip a leading "story_" if a caller forgot to remove it.
  const id = rawId.replace(/^story_/, '');
  const body = (await c.req.json().catch(() => null)) as { done?: boolean } | null;
  if (!body || typeof body.done !== 'boolean') {
    return c.json({ error: 'done (boolean) required' }, 400);
  }
  setStateField(`slot_story_${id}`, body.done ? '1' : '0');
  return c.json({ ok: true });
});

// ─── POV CRUD (file-per-row at 05_Assets/POVs/<id>.md) ─────────────────────

const POVS_DIR_REL = ['05_Assets', 'POVs'] as const;

function povSectionBody(parts: {
  title: string;
  common_belief?: string | null;
  my_pov?: string | null;
  story_behind?: string | null;
  how_i_use?: string | null;
}): string {
  return [
    `# ${parts.title}`,
    '',
    '## POV',
    '',
    parts.my_pov ?? '[Your contrarian take here.]',
    '',
    '## The Common Belief',
    '',
    parts.common_belief ?? '[What most people in your industry believe.]',
    '',
    '## The Story Behind It',
    '',
    parts.story_behind ?? '[to be developed]',
    '',
    "## How I'd Use This In A Video",
    '',
    parts.how_i_use ?? '[to be developed]',
    '',
  ].join('\n');
}

function extractSection(body: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const m = body.match(re);
  return m ? m[1]!.trim() : '';
}

app.post('/povs', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { title: string; common_belief?: string; my_pov?: string; story_behind?: string; how_i_use?: string }
    | null;
  if (!body?.title?.trim()) return c.json({ error: 'title required' }, 400);
  const slug = slugify(body.title) || `pov-${Date.now()}`;
  const id = `pov-${slug}`;
  const today = new Date().toISOString().slice(0, 10);
  const filePath = abs(POVS_DIR_REL[0], POVS_DIR_REL[1], `pov_${slug}.md`);
  const frontmatter = {
    id,
    type: 'pov' as const,
    title: body.title.trim(),
    format: 'short' as const,
    usage_count: 0,
    created: today,
    updated: today,
  };
  saveFile(filePath, frontmatter, povSectionBody(body));
  return c.json({ ok: true, id });
});

app.patch('/povs/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as
    | { title?: string; common_belief?: string | null; my_pov?: string | null; story_behind?: string | null; how_i_use?: string | null }
    | null;
  if (!body) return c.json({ error: 'body required' }, 400);

  // Find the file by id (frontmatter id or filename).
  const dir = abs(POVS_DIR_REL[0], POVS_DIR_REL[1]);
  let targetFile: string | null = null;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md') || f.startsWith('_') || f.startsWith('.')) continue;
    const entry = loadFile(path.join(dir, f));
    if (!entry) continue;
    const fmId = (entry.frontmatter as any)?.id;
    if (fmId === id || f.replace(/\.md$/, '') === id || `pov-${slugify(f.replace(/^pov_|^asset_pov-|\.md$/g, ''))}` === id) {
      targetFile = path.join(dir, f);
      break;
    }
  }
  if (!targetFile) return c.json({ error: 'not found' }, 404);

  const entry = loadFile(targetFile);
  if (!entry) return c.json({ error: 'not found' }, 404);
  const fm = entry.frontmatter as any;
  const title = body.title ?? fm.title ?? entry.id;

  // Merge sections: read existing, overlay any provided ones.
  const merged = {
    title,
    common_belief: body.common_belief !== undefined ? body.common_belief : extractSection(entry.body, 'The Common Belief'),
    my_pov: body.my_pov !== undefined ? body.my_pov : extractSection(entry.body, 'POV'),
    story_behind: body.story_behind !== undefined ? body.story_behind : extractSection(entry.body, 'The Story Behind It'),
    how_i_use: body.how_i_use !== undefined ? body.how_i_use : extractSection(entry.body, "How I'd Use This In A Video"),
  };

  const nextFm = { ...fm, title, updated: new Date().toISOString().slice(0, 10) };
  saveFile(targetFile, nextFm, povSectionBody(merged));
  return c.json({ ok: true });
});

app.delete('/povs/:id', (c) => {
  const id = c.req.param('id');
  const dir = abs(POVS_DIR_REL[0], POVS_DIR_REL[1]);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md') || f.startsWith('_') || f.startsWith('.')) continue;
    const entry = loadFile(path.join(dir, f));
    if (!entry) continue;
    if ((entry.frontmatter as any)?.id === id || f.replace(/\.md$/, '') === id) {
      // Archive instead of hard delete.
      const archiveDir = path.join(dir, '_archive');
      fs.mkdirSync(archiveDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fs.renameSync(path.join(dir, f), path.join(archiveDir, `${stamp}__${f}`));
      return c.json({ ok: true });
    }
  }
  return c.json({ error: 'not found' }, 404);
});

// ─── Wins + Micro-stories banks (JSON files) ───────────────────────────────

type WinEntry = {
  id: string;
  title: string;
  body?: string;
  kind?: 'own' | 'client';
  metric?: string;
  status?: 'pending' | 'confirmed' | 'rejected';
  date?: number;
  created_at: number;
  updated_at: number;
};

type MicroStory = {
  id: string;
  text: string;
  source_episode?: string;
  status?: 'candidate' | 'confirmed' | 'rejected';
  tags?: string[];
  created_at: number;
  updated_at: number;
};

function bankPath(name: 'wins' | 'micro-stories'): string {
  return abs('00_System', `${name}.json`);
}
function loadBank<T>(name: 'wins' | 'micro-stories' | 'teaching-frameworks' | 'proof-points'): T[] {
  try {
    return JSON.parse(fs.readFileSync(bankPath(name), 'utf8')) as T[];
  } catch {
    return [];
  }
}
function saveBank<T>(name: 'wins' | 'micro-stories' | 'teaching-frameworks' | 'proof-points', items: T[]): void {
  fs.mkdirSync(path.dirname(bankPath(name)), { recursive: true });
  fs.writeFileSync(bankPath(name), JSON.stringify(items, null, 2), 'utf8');
}
function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// Wins
app.post('/wins', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { title?: string; body?: string; kind?: 'own' | 'client'; metric?: string; date?: number; status?: 'pending' | 'confirmed' | 'rejected' }
    | null;
  if (!body?.title?.trim()) return c.json({ error: 'title required' }, 400);
  const items = loadBank<WinEntry>('wins');
  const entry: WinEntry = {
    id: crypto.randomUUID(),
    title: body.title.trim(),
    body: body.body,
    kind: body.kind ?? 'own',
    metric: body.metric,
    status: body.status ?? 'pending',
    date: body.date ?? nowSec(),
    created_at: nowSec(),
    updated_at: nowSec(),
  };
  items.unshift(entry);
  saveBank('wins', items);
  return c.json({ ok: true, id: entry.id });
});

app.patch('/wins/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as Partial<WinEntry> | null;
  if (!body) return c.json({ error: 'body required' }, 400);
  const items = loadBank<WinEntry>('wins');
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  items[idx] = { ...items[idx]!, ...body, updated_at: nowSec() };
  saveBank('wins', items);
  return c.json({ ok: true });
});

app.delete('/wins/:id', (c) => {
  const id = c.req.param('id');
  const items = loadBank<WinEntry>('wins').filter((x) => x.id !== id);
  saveBank('wins', items);
  return c.json({ ok: true });
});

// Micro-stories
app.post('/micro-stories', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { text?: string; source_episode?: string; status?: 'candidate' | 'confirmed' | 'rejected'; tags?: string[] }
    | null;
  if (!body?.text?.trim()) return c.json({ error: 'text required' }, 400);
  const items = loadBank<MicroStory>('micro-stories');
  const entry: MicroStory = {
    id: crypto.randomUUID(),
    text: body.text.trim(),
    source_episode: body.source_episode,
    status: body.status ?? 'candidate',
    tags: body.tags ?? [],
    created_at: nowSec(),
    updated_at: nowSec(),
  };
  items.unshift(entry);
  saveBank('micro-stories', items);
  return c.json({ ok: true, id: entry.id });
});

app.patch('/micro-stories/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as Partial<MicroStory> | null;
  if (!body) return c.json({ error: 'body required' }, 400);
  const items = loadBank<MicroStory>('micro-stories');
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  items[idx] = { ...items[idx]!, ...body, updated_at: nowSec() };
  saveBank('micro-stories', items);
  return c.json({ ok: true });
});

app.delete('/micro-stories/:id', (c) => {
  const id = c.req.param('id');
  const items = loadBank<MicroStory>('micro-stories').filter((x) => x.id !== id);
  saveBank('micro-stories', items);
  return c.json({ ok: true });
});

// ─── Move bank entry between dimensions ──────────────────────────────────
// POST /api/reputation/banks/move
// body: { entry_id, from: 'value'|'authority'|'connection'|'pov', to: same }
// Reads the entry from the source bank, removes it, appends to target.
// For pov source/target we use the POV files in 05_Assets/POVs/.

type AnyBankEntry = {
  id: string;
  text?: string;
  title?: string;
  context?: string;
  source_transcript?: string;
  source_timestamp?: string;
  source_moments?: Array<{ text: string; timestamp: string }>;
  status?: string;
  created_at?: number;
  updated_at?: number;
  // POV-shaped fields (populated when source is a POV file)
  my_pov?: string;
  story_behind?: string;
  how_i_use?: string;
  common_belief?: string;
};

type DimKind = 'value' | 'authority' | 'connection' | 'pov';

const KIND_TO_BANK: Record<Exclude<DimKind, 'pov'>, 'teaching-frameworks' | 'proof-points' | 'micro-stories'> = {
  value: 'teaching-frameworks',
  authority: 'proof-points',
  connection: 'micro-stories',
};

const KIND_PREFIX: Record<DimKind, string> = {
  value: 'tf',
  authority: 'pc',
  connection: 'ms',
  pov: 'pov',
};

function slugifyForFile(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

function readPovFileById(id: string): { filePath: string; entry: AnyBankEntry } | null {
  const dir = abs(POVS_DIR_REL[0], POVS_DIR_REL[1]);
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md') || f.startsWith('_') || f.startsWith('.')) continue;
      const filePath = path.join(dir, f);
      const fileEntry = loadFile(filePath);
      if (!fileEntry) continue;
      const fm = (fileEntry.frontmatter ?? {}) as any;
      if (fm.id === id || f.replace(/\.md$/, '') === id) {
        const body = fileEntry.body;
        const grab = (heading: string) => {
          const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
          const m = body.match(re);
          return m ? m[1]!.trim() : '';
        };
        return {
          filePath,
          entry: {
            id: fm.id ?? f.replace(/\.md$/, ''),
            text: grab('POV') || body.replace(/^#\s+.+?\n/, '').trim(),
            title: fm.title ?? id,
            context: grab('Context') || null,
            source_transcript: fm.source_transcript ?? null,
            source_timestamp: fm.source_timestamp ?? null,
            source_moments: [],
            my_pov: grab('POV'),
            story_behind: grab('The Story Behind It'),
            how_i_use: grab("How I'd Use This In A Video"),
            common_belief: grab('The Common Belief'),
            created_at: typeof fm.created === 'string' ? Math.floor(Date.parse(fm.created) / 1000) || undefined : undefined,
          },
        };
      }
    }
  } catch {}
  return null;
}

function writePovFile(entry: AnyBankEntry): string {
  const dir = abs(POVS_DIR_REL[0], POVS_DIR_REL[1]);
  fs.mkdirSync(dir, { recursive: true });
  const slug = `pov-${slugifyForFile(entry.title || entry.text?.split(/[.!?]/)[0] || 'untitled')}`;
  const filename = `asset_${slug}.md`;
  const filePath = path.join(dir, filename);
  const today = new Date().toISOString().slice(0, 10);
  const title = (entry.title || entry.text || 'POV').slice(0, 60).replace(/"/g, '\\"');
  const md =
    '---\n' +
    'type: pov\n' +
    `slug: ${slug}\n` +
    'status: draft\n' +
    'tags:\n  - type/asset\n  - domain/povs\n  - source/transcript\n' +
    'aliases:\n' + `  - "${title}"\n` +
    `id: ${slug}\n` +
    `title: "${title}"\n` +
    `created: '${today}'\n` +
    `updated: '${today}'\n` +
    (entry.source_transcript ? `source_transcript: ${entry.source_transcript}\n` : '') +
    (entry.source_timestamp ? `source_timestamp: ${entry.source_timestamp}\n` : '') +
    '---\n\n' +
    '## POV\n\n' +
    `${entry.text ?? ''}\n\n` +
    (entry.context ? `## Context\n\n${entry.context}\n` : '');
  fs.writeFileSync(filePath, md);
  return filePath;
}

function deletePovFileById(id: string): boolean {
  const found = readPovFileById(id);
  if (!found) return false;
  try { fs.unlinkSync(found.filePath); return true; } catch { return false; }
}

function loadFromBankOrPov(kind: DimKind, id: string): AnyBankEntry | null {
  if (kind === 'pov') return readPovFileById(id)?.entry ?? null;
  const items = loadBank<AnyBankEntry>(KIND_TO_BANK[kind]);
  return items.find((x) => x.id === id) ?? null;
}

function removeFromSource(kind: DimKind, id: string): boolean {
  if (kind === 'pov') return deletePovFileById(id);
  const name = KIND_TO_BANK[kind];
  const items = loadBank<AnyBankEntry>(name);
  const next = items.filter((x) => x.id !== id);
  if (next.length === items.length) return false;
  saveBank(name, next);
  return true;
}

function appendToTarget(kind: DimKind, entry: AnyBankEntry): { path: string; id: string } {
  const now = nowSec();
  if (kind === 'pov') {
    const filePath = writePovFile(entry);
    return { path: filePath, id: path.basename(filePath, '.md') };
  }
  const newId = `${KIND_PREFIX[kind]}-${now}-${Math.random().toString(36).slice(2, 6)}`;
  const name = KIND_TO_BANK[kind];
  const items = loadBank<AnyBankEntry>(name);
  items.push({
    ...entry,
    id: newId,
    status: 'confirmed',
    created_at: now,
    updated_at: now,
  });
  saveBank(name, items);
  return { path: abs('00_System', `${name}.json`), id: newId };
}

// PATCH /api/reputation/banks/:kind/:entry_id - update topic tags on a bank entry
// body: { tags: string[] }
app.patch('/banks/:kind/:entry_id', async (c) => {
  const kind = c.req.param('kind') as 'value' | 'authority' | 'connection' | 'pov';
  const entry_id = c.req.param('entry_id');
  const body = (await c.req.json().catch(() => null)) as { tags?: string[] } | null;
  if (!body || !Array.isArray(body.tags)) return c.json({ error: 'tags array required' }, 400);
  const cleaned = Array.from(new Set(body.tags.map((t) => t.trim()).filter(Boolean)));

  if (kind === 'pov') {
    // POV is file-based. Write topics to frontmatter.
    const found = readPovFileById(entry_id);
    if (!found) return c.json({ error: 'POV not found' }, 404);
    const fileEntry = loadFile(found.filePath);
    if (!fileEntry) return c.json({ error: 'could not load POV file' }, 500);
    const fm = { ...((fileEntry.frontmatter as any) ?? {}), topics: cleaned, updated: new Date().toISOString().slice(0, 10) };
    saveFile(found.filePath, fm as Record<string, unknown>, fileEntry.body);
    return c.json({ ok: true });
  }

  if (!(kind === 'value' || kind === 'authority' || kind === 'connection')) {
    return c.json({ error: 'invalid kind' }, 400);
  }
  const bankName = ({ value: 'teaching-frameworks', authority: 'proof-points', connection: 'micro-stories' } as const)[kind];
  const items = loadBank<{ id: string; tags?: string[]; updated_at?: number }>(bankName);
  const idx = items.findIndex((x) => x.id === entry_id);
  if (idx === -1) return c.json({ error: 'entry not found' }, 404);
  items[idx] = { ...items[idx]!, tags: cleaned, updated_at: nowSec() };
  saveBank(bankName, items);
  return c.json({ ok: true });
});

app.post('/banks/move', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { entry_id?: string; from?: DimKind; to?: DimKind }
    | null;
  if (!body?.entry_id || !body.from || !body.to) {
    return c.json({ error: 'entry_id, from, to required' }, 400);
  }
  const validKinds: DimKind[] = ['value', 'authority', 'connection', 'pov'];
  if (!validKinds.includes(body.from) || !validKinds.includes(body.to)) {
    return c.json({ error: 'invalid kind' }, 400);
  }
  if (body.from === body.to) return c.json({ ok: true, note: 'no change' });

  const entry = loadFromBankOrPov(body.from, body.entry_id);
  if (!entry) return c.json({ error: `not found in ${body.from} bank` }, 404);

  const target = appendToTarget(body.to, entry);
  removeFromSource(body.from, body.entry_id);

  return c.json({ ok: true, new_id: target.id, new_path: target.path });
});

void getStateFm;

export default app;
