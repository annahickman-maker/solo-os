/**
 * Skills - read SKILL.md from skill folders.
 *
 * Skill roots are configurable via env. Set SKILL_ROOTS as a comma-separated
 * list of `path:pack` pairs. Defaults to the vault's own `.claude/skills`.
 *
 * Each skill is a folder containing a SKILL.md with YAML frontmatter
 * (name, description). The "description" field is what triggers it.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { VAULT_ROOT } from '../vault.js';

function parseSkillRoots(): { path: string; pack: string }[] {
  const raw = process.env.SKILL_ROOTS?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [p, pack] = entry.split(':');
        return { path: p!, pack: pack ?? 'vault' };
      });
  }
  return [
    { path: path.join(VAULT_ROOT, '.claude', 'skills'), pack: 'vault' },
  ];
}

const SKILL_ROOTS = parseSkillRoots();

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Skills page groups by these exact category names. The frontend hides any
// category not in this list. (Anything outside the list becomes 'Other'.)
function categorize(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith('youtube-')) return 'YouTube';
  if (n.startsWith('instagram-') || n === 'reel-scripter') return 'Instagram';
  if (['cta-writing', 'emotion-in-copy', 'headline-writing', 'sales-page-builder', 'storytelling-for-conversion', 'testimonial-selection'].includes(n)) return 'Copywriting';
  if (['ai-image-prompting', 'brand-taste', 'color-theory-practical', 'design-critique', 'framer-design', 'frontend-design', 'impeccable', 'layout-systems', 'nano-banana-integration', 'website-sections-cheatsheet', 'editorial-typography'].includes(n)) return 'Design';
  if (['process-zoom-transcript', 'write-a-skill', 'content-extractor'].includes(n)) return 'Workflows';
  if (n.includes('onboarding')) return 'Onboarding';
  return 'Other';
}

// First sentence of the trigger summary, capped at 200 chars.
function oneSentence(text: string): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const m = clean.match(/^(.+?[.!?])(?:\s|$)/);
  let s = m ? m[1]! : clean;
  if (s.length > 200) s = s.slice(0, 197).trim() + '...';
  return s;
}

type SkillItem = {
  id: string;
  name: string;
  summary: string;
  trigger_summary: string;
  pack: string;
  category: string;
  full_md?: string;
  location?: string;
};

function loadAllSkills(): Map<string, SkillItem> {
  const byId = new Map<string, SkillItem>();
  for (const root of SKILL_ROOTS) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const skillFile = path.join(root.path, e.name, 'SKILL.md');
      let raw: string;
      try {
        raw = fs.readFileSync(skillFile, 'utf8');
      } catch {
        continue;
      }
      const parsed = matter(raw);
      const fm: any = parsed.data ?? {};
      const name = typeof fm.name === 'string' ? fm.name : e.name;
      const trigger = typeof fm.description === 'string' ? fm.description : '';
      const id = `skill-${root.pack}-${slugify(e.name)}`;
      // Skip duplicates: if the same skill name exists in multiple packs,
      // first one wins.
      if (Array.from(byId.values()).some((s) => s.name === name)) continue;
      byId.set(id, {
        id,
        name,
        summary: oneSentence(trigger),
        trigger_summary: trigger,
        pack: root.pack,
        category: categorize(name),
        full_md: raw,
        location: skillFile,
      });
    }
  }
  return byId;
}

const app = new Hono();

app.get('/', (c) => {
  const all = Array.from(loadAllSkills().values()).map((s) => ({
    id: s.id,
    name: s.name,
    summary: s.summary,
    trigger_summary: s.trigger_summary,
    pack: s.pack,
    category: s.category,
  }));
  all.sort((a, b) => a.pack.localeCompare(b.pack) || a.name.localeCompare(b.name));
  return c.json({ items: all });
});

app.get('/:id', (c) => {
  const id = c.req.param('id');
  const skill = loadAllSkills().get(id);
  if (!skill) return c.json({ error: 'not found' }, 404);
  return c.json({
    id: skill.id,
    name: skill.name,
    trigger_summary: skill.trigger_summary,
    full_md: skill.full_md ?? '',
    pack: skill.pack,
    location: skill.location ?? '',
  });
});

export default app;
