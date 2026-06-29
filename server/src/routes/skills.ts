/**
 * Skills - read + write SKILL.md from skill folders.
 *
 * Two default sources, read in order (first occurrence of a name wins):
 *   1. BUNDLED: the dashboard repo's own `.claude/skills/` (pack `solo-os`) -
 *      ships with the Solopreneur Systems skill pack. Built-in: read-only,
 *      duplicate-to-edit, unless listed in CUSTOM_SKILLS below.
 *   2. VAULT:   `<VAULT_ROOT>/.claude/skills/` (pack `vault`) - the member's
 *      own additions. This is the writable root for new + duplicated skills.
 *
 * Set SKILL_ROOTS env var as a comma-separated list of `relativePath:pack`
 * pairs to override the defaults (paths resolved relative to VAULT_ROOT).
 *
 * Each skill is a folder containing a SKILL.md with YAML frontmatter. Claude
 * only requires `name` + `description` (description is the trigger). The
 * dashboard editor layers optional display fields on top (title, card,
 * category, inputs, outputs, icon, color, notes, knowledge) - all ignored by
 * Claude, used only to render and group the skill nicely on the Skills page.
 *
 * Hidden skills: some skills are components another skill composes (the copy
 * sub-skills behind Sales Page Builder, the youtube-script-* parts behind the
 * script orchestrator) or pure techniques. They still work when Claude composes
 * them, but nobody "runs" them from the page - so a skill with `hidden: true`
 * (or `visible: false`) in its frontmatter is kept but not listed.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { VAULT_ROOT } from '../vault.js';

// Dashboard repo root: server/src/routes/skills.ts -> server/src/routes -> server/src -> server -> repo
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

function resolveSkillRoots(): { path: string; pack: string }[] {
  const raw = process.env.SKILL_ROOTS?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const i = entry.lastIndexOf(':');
        return i > 0
          ? { path: path.join(VAULT_ROOT, entry.slice(0, i).trim()), pack: entry.slice(i + 1).trim() }
          : { path: path.join(VAULT_ROOT, entry), pack: 'custom' };
      });
  }
  return [
    { path: path.join(REPO_ROOT, '.claude', 'skills'), pack: 'solo-os' },
    { path: path.join(VAULT_ROOT, '.claude', 'skills'), pack: 'vault' },
  ];
}

const SKILL_ROOTS = resolveSkillRoots();

// New + duplicated skills are written to the member's own vault folder, never
// the shipped pack. Falls back to the first root if no vault pack is present.
const WRITABLE_ROOT = SKILL_ROOTS.find((r) => r.pack === 'vault') ?? SKILL_ROOTS[0]!;

// The only skills the user can edit in place from the dashboard - their own
// (or per-brand) creations. Everything else (the shipped pack) is built-in:
// read-only, duplicate-to-edit. Add a slug here to make it editable in place.
const CUSTOM_SKILLS = new Set([
  'instagram-carousel',
  'client-strategy-summary',
]);

// Unlock the built-in skills so they can be edited in place from the dashboard.
// Leave `false` to keep the shipped pack read-only / duplicate-to-edit.
const ALLOW_BUILTIN_EDITS = false;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Taxonomy lives in each skill's frontmatter (a `category` field and a `hidden`
// flag), so it travels with the skill file. Anything without an explicit
// category falls into Create; the page groups by Meta / Research / Ideas /
// Create / Strategy / Clients.
const DEFAULT_CATEGORY = 'Create';

function oneSentence(text: string): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const m = clean.match(/^(.+?[.!?])(?:\s|$)/);
  let s = m ? m[1]! : clean;
  if (s.length > 200) s = s.slice(0, 197).trim() + '...';
  return s;
}

// An input a skill asks for before it runs. `type` maps to a dashboard data
// source + picker (transcript / offer / avatar / video / client / project /
// idea / pov / text). The pre-run selection panel renders one picker per input.
type SkillInput = { type: string; multiple?: boolean; optional?: boolean; label?: string; description?: string; scope?: string };

function normalizeInputs(v: unknown): SkillInput[] {
  if (!Array.isArray(v)) return [];
  const out: SkillInput[] = [];
  for (const raw of v) {
    if (typeof raw === 'string' && raw.trim()) {
      out.push({ type: raw.trim() });
    } else if (raw && typeof raw === 'object' && typeof (raw as any).type === 'string') {
      const r = raw as any;
      const inp: SkillInput = { type: String(r.type) };
      if (r.multiple === true) inp.multiple = true;
      if (r.optional === true) inp.optional = true;
      if (typeof r.label === 'string' && r.label) inp.label = r.label;
      if (typeof r.description === 'string' && r.description) inp.description = r.description;
      if (typeof r.scope === 'string' && r.scope) inp.scope = r.scope;
      out.push(inp);
    }
  }
  return out;
}

type Skill = {
  id: string;
  name: string;
  folder: string;
  title: string;
  card: string;
  description: string;
  instructions: string;
  category: string;
  inputs: SkillInput[];
  outputs: SkillInput[];
  icon: string;
  color: string;
  notes: string;
  knowledge: string;
  schedule: Record<string, unknown> | null;
  hidden: boolean;
  pack: string;
  builtIn: boolean;
  location: string;
};

function parseSkill(root: { path: string; pack: string }, folder: string): Skill | null {
  const skillFile = path.join(root.path, folder, 'SKILL.md');
  let raw: string;
  try {
    raw = fs.readFileSync(skillFile, 'utf8');
  } catch {
    return null;
  }
  const parsed = matter(raw);
  const fm: any = parsed.data ?? {};
  const name = typeof fm.name === 'string' && fm.name ? fm.name : folder;
  return {
    id: `skill-${root.pack}-${slugify(folder)}`,
    name,
    folder,
    title: typeof fm.title === 'string' && fm.title ? fm.title : '',
    card: typeof fm.card === 'string' ? fm.card : '',
    description: typeof fm.description === 'string' ? fm.description : '',
    instructions: parsed.content.trim(),
    category: typeof fm.category === 'string' && fm.category ? fm.category : DEFAULT_CATEGORY,
    inputs: normalizeInputs(fm.inputs),
    outputs: normalizeInputs(fm.outputs),
    icon: typeof fm.icon === 'string' ? fm.icon : '',
    color: typeof fm.color === 'string' ? fm.color : '',
    notes: typeof fm.notes === 'string' ? fm.notes : '',
    knowledge: typeof fm.knowledge === 'string' ? fm.knowledge : '',
    schedule: fm.schedule && typeof fm.schedule === 'object' && !Array.isArray(fm.schedule) ? (fm.schedule as Record<string, unknown>) : null,
    hidden: fm.hidden === true || fm.visible === false,
    pack: root.pack,
    builtIn: !CUSTOM_SKILLS.has(folder),
    location: skillFile,
  };
}

function loadAllSkills(): Map<string, Skill> {
  const byId = new Map<string, Skill>();
  const seen = new Set<string>();
  for (const root of SKILL_ROOTS) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const skill = parseSkill(root, e.name);
      if (!skill) continue;
      // Dedupe on both folder + frontmatter name; first root wins.
      const keyName = `n:${skill.name}`;
      const keyFolder = `f:${skill.folder}`;
      if (seen.has(keyName) || seen.has(keyFolder)) continue;
      seen.add(keyName);
      seen.add(keyFolder);
      byId.set(skill.id, skill);
    }
  }
  return byId;
}

function serializeSkill(s: {
  name: string;
  title?: string;
  card?: string;
  description: string;
  instructions: string;
  category?: string;
  inputs?: SkillInput[];
  outputs?: SkillInput[];
  icon?: string;
  color?: string;
  notes?: string;
  knowledge?: string;
  schedule?: Record<string, unknown> | null;
  hidden?: boolean;
}): string {
  const data: Record<string, unknown> = { name: s.name, description: s.description };
  if (s.title) data.title = s.title;
  if (s.card) data.card = s.card;
  if (s.category) data.category = s.category;
  if (s.inputs && s.inputs.length) data.inputs = s.inputs;
  if (s.outputs && s.outputs.length) data.outputs = s.outputs;
  if (s.icon) data.icon = s.icon;
  if (s.color) data.color = s.color;
  if (s.notes) data.notes = s.notes;
  if (s.knowledge) data.knowledge = s.knowledge;
  if (s.schedule && Object.keys(s.schedule).length) data.schedule = s.schedule;
  if (s.hidden) data.hidden = true;
  // lineWidth -1 keeps long strings (the description) on one line instead of
  // reflowing into a YAML block scalar - so editing a skill produces a clean,
  // minimal diff.
  return matter.stringify(`\n${s.instructions.trim()}\n`, data, { lineWidth: -1 } as any);
}

function fullSkill(s: Skill) {
  return {
    id: s.id,
    name: s.name,
    title: s.title,
    card: s.card,
    description: s.description,
    trigger_summary: s.description,
    instructions: s.instructions,
    category: s.category,
    inputs: s.inputs,
    outputs: s.outputs,
    icon: s.icon,
    color: s.color,
    notes: s.notes,
    knowledge: s.knowledge,
    schedule: s.schedule,
    hidden: s.hidden,
    pack: s.pack,
    builtIn: s.builtIn,
    editable: !s.builtIn || ALLOW_BUILTIN_EDITS,
    location: s.location,
  };
}

const app = new Hono();

app.get('/', (c) => {
  const includeHidden = c.req.query('all') === '1';
  const all = Array.from(loadAllSkills().values())
    .filter((s) => includeHidden || !s.hidden) // invisible skills still work for Claude, just not shown here
    .map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      summary: s.card || oneSentence(s.description),
      trigger_summary: s.description,
      pack: s.pack,
      category: s.category,
      icon: s.icon,
      color: s.color,
      builtIn: s.builtIn,
      schedule: s.schedule,
    }));
  all.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return c.json({ items: all });
});

app.get('/:id', (c) => {
  const skill = loadAllSkills().get(c.req.param('id'));
  if (!skill) return c.json({ error: 'not found' }, 404);
  return c.json(fullSkill(skill));
});

app.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.title?.trim()) return c.json({ error: 'title is required' }, 400);

  const slug = slugify(body.name || body.title);
  if (!slug) return c.json({ error: 'could not derive a valid skill name from the title' }, 400);

  const dir = path.join(WRITABLE_ROOT.path, slug);
  const file = path.join(dir, 'SKILL.md');
  if (fs.existsSync(file)) return c.json({ error: `a skill named "${slug}" already exists` }, 409);

  const md = serializeSkill({
    name: slug,
    title: body.title.trim(),
    card: body.card ?? '',
    description: body.description ?? '',
    instructions: body.instructions ?? '',
    category: body.category ?? '',
    inputs: normalizeInputs(body.inputs),
    outputs: normalizeInputs(body.outputs),
    icon: body.icon ?? '',
    color: body.color ?? '',
    notes: body.notes ?? '',
    knowledge: body.knowledge ?? '',
    schedule: body.schedule ?? null,
    hidden: body.hidden === true,
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, md, 'utf8');
  return c.json({ id: `skill-${WRITABLE_ROOT.pack}-${slug}`, name: slug }, 201);
});

app.put('/:id', async (c) => {
  const skill = loadAllSkills().get(c.req.param('id'));
  if (!skill) return c.json({ error: 'not found' }, 404);
  if (skill.builtIn && !ALLOW_BUILTIN_EDITS) return c.json({ error: 'built-in skills are read-only - duplicate it to edit' }, 403);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'bad body' }, 400);

  const md = serializeSkill({
    name: skill.name,
    title: body.title ?? skill.title,
    card: body.card ?? skill.card,
    description: body.description ?? skill.description,
    instructions: body.instructions ?? skill.instructions,
    category: body.category ?? skill.category,
    inputs: body.inputs !== undefined ? normalizeInputs(body.inputs) : skill.inputs,
    outputs: body.outputs !== undefined ? normalizeInputs(body.outputs) : skill.outputs,
    icon: body.icon ?? skill.icon,
    color: body.color ?? skill.color,
    notes: body.notes ?? skill.notes,
    knowledge: body.knowledge ?? skill.knowledge,
    schedule: body.schedule !== undefined ? body.schedule : skill.schedule,
    hidden: body.hidden !== undefined ? body.hidden === true : skill.hidden,
  });
  fs.writeFileSync(skill.location, md, 'utf8');
  const updated = loadAllSkills().get(skill.id);
  return c.json(updated ? fullSkill(updated) : fullSkill(skill));
});

app.post('/:id/duplicate', (c) => {
  const skill = loadAllSkills().get(c.req.param('id'));
  if (!skill) return c.json({ error: 'not found' }, 404);

  let slug = `${skill.folder}-copy`;
  let n = 2;
  while (fs.existsSync(path.join(WRITABLE_ROOT.path, slug))) {
    slug = `${skill.folder}-copy-${n++}`;
  }
  const dir = path.join(WRITABLE_ROOT.path, slug);
  const md = serializeSkill({
    name: slug,
    title: skill.title || skill.name,
    card: skill.card,
    description: skill.description,
    instructions: skill.instructions,
    category: skill.category,
    inputs: skill.inputs,
    outputs: skill.outputs,
    icon: skill.icon,
    color: skill.color,
    notes: skill.notes,
    knowledge: skill.knowledge,
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), md, 'utf8');
  return c.json({ id: `skill-${WRITABLE_ROOT.pack}-${slug}`, name: slug }, 201);
});

export default app;
