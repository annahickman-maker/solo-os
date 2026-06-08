/**
 * Profile - reads the 6 foundational files from 01_Core/.
 *
 * Each file is a hand-written prose doc; we extract a summary (first
 * paragraph) and compute completion as length-based heuristic.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import { abs } from '../vault.js';

const SECTIONS = [
  { id: 'positioning', filename: 'core_positioning.md', title: 'Positioning', phase: 'Phase 1', sort_order: 1 },
  { id: 'audience', filename: 'core_audience.md', title: 'Audience', phase: 'Phase 2', sort_order: 2 },
  { id: 'my-story', filename: 'core_my-story.md', title: 'My Story', phase: 'Phase 3', sort_order: 3 },
  { id: 'core-ip', filename: 'core_ip.md', title: 'Core IP', phase: 'Phase 4', sort_order: 4 },
  { id: 'offer-suite', filename: 'core_offer-suite.md', title: 'Offer Suite', phase: 'Phase 5', sort_order: 5 },
  { id: 'voice-style', filename: 'core_voice-style.md', title: 'Voice + Style', phase: 'Phase 6', sort_order: 6 },
];

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  return end > -1 ? content.slice(end + 4).trimStart() : content;
}

function summarize(content: string): string {
  const body = stripFrontmatter(content);
  const lines = body.split('\n');
  const para: string[] = [];
  for (const l of lines) {
    const t = l.trim();
    if (t === '') {
      if (para.length > 0) break;
      continue;
    }
    if (t.startsWith('#') || t.startsWith('|') || t === '---') continue;
    para.push(t);
    if (para.join(' ').length > 220) break;
  }
  return para.join(' ').slice(0, 240);
}

function completion(content: string): number {
  // Heuristic: more chars (excluding frontmatter + headings) = higher completion.
  // 2000+ chars = 100%. Below 200 = 0%. Linear in between.
  const body = stripFrontmatter(content).replace(/^#.*$/gm, '').trim();
  const len = body.length;
  if (len < 200) return 0;
  if (len >= 2000) return 100;
  return Math.round(((len - 200) / 1800) * 100);
}

const app = new Hono();

function loadSection(s: typeof SECTIONS[number]) {
  const filePath = abs('01_Core', s.filename);
  let raw = '';
  let mtime = 0;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
    const stat = fs.statSync(filePath);
    mtime = Math.floor(stat.mtimeMs / 1000);
  } catch {}
  return {
    id: s.id,
    title: s.title,
    summary: summarize(raw),
    phase: s.phase,
    sort_order: s.sort_order,
    completion: completion(raw),
    updated_at: mtime,
    content: stripFrontmatter(raw),
    filename: s.filename,
  };
}

app.get('/', (c) => {
  const items = SECTIONS.map((s) => {
    const x = loadSection(s);
    return {
      id: x.id,
      title: x.title,
      summary: x.summary,
      phase: x.phase,
      sort_order: x.sort_order,
      completion: x.completion,
      updated_at: x.updated_at,
    };
  });
  const overall = items.length ? Math.round(items.reduce((a, b) => a + b.completion, 0) / items.length) : 0;
  return c.json({ items, overall_completion: overall });
});

app.get('/:id', (c) => {
  const id = c.req.param('id');
  const section = SECTIONS.find((s) => s.id === id);
  if (!section) return c.json({ error: 'not found' }, 404);
  const x = loadSection(section);
  return c.json({
    id: x.id,
    title: x.title,
    content: x.content,
    summary: x.summary,
    phase: x.phase,
    completion: x.completion,
    updated_at: x.updated_at,
  });
});

export default app;
