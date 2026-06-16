/**
 * Profile - reads the 6 foundational files from 01_Core/.
 *
 * Each file is a hand-written prose doc; we extract a summary (first
 * paragraph) and compute completion as length-based heuristic.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import { abs, loadFile } from '../vault.js';
import { BRIDGE_URL } from '../lib/bridge.js';
import {
  extractAllFromCore,
  writeBrandSlotsToState,
  writeAvatarFiles,
  writePovFiles,
  writeOfferRungs,
  writeJourneyEntries,
  appendToBank,
} from '../lib/extractFromCore.js';

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

// ─── Auto-extraction on first access ─────────────────────────────────────
//
// When the dashboard server boots against a vault that already has core
// files but no Layer 2 data (state.md slots, avatars, POVs, offer rungs,
// journey entries), fire extraction in the background. Idempotent in the
// sense that existing entries are preserved.
//
// State lives in this module so the trigger fires at most once per server
// lifetime. The dashboard polls /api/profile and sees extraction_status go
// from 'running' to 'completed'.

type ExtractionStatus = 'idle' | 'running' | 'completed' | 'error';
let extractionStatus: ExtractionStatus = 'idle';
let extractionResult: Record<string, unknown> | null = null;
let extractionError: string | null = null;

function hasAnyPopulatedSlots(): boolean {
  try {
    const state = loadFile(abs('00_System', 'state.md'));
    const fm = (state?.frontmatter ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(fm)) {
      if (!key.startsWith('slot_')) continue;
      const v = fm[key];
      if (typeof v === 'string' && v.trim().length > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function runFullExtraction(): Promise<void> {
  const result: Record<string, unknown> = {};
  try {
    // ONE bridge call returns the full structured extraction. The 6 core
    // files are sent once instead of 6 times - ~70% fewer input tokens than
    // the prior per-extractor approach. See extractAllFromCore for details.
    const all = await extractAllFromCore();
    result.slots = writeBrandSlotsToState(all.slots);
    result.avatars = writeAvatarFiles(all.avatars);
    result.povs = writePovFiles(all.povs);
    result.offer_rungs = writeOfferRungs(all.rungs);
    result.journey = writeJourneyEntries(all.journey);
    result.wins = appendToBank('wins', all.wins);
    extractionResult = result;
    extractionStatus = 'completed';
    console.log('[profile] auto-extraction completed:', JSON.stringify(result));
  } catch (err: any) {
    extractionError = err?.message ?? 'unknown error';
    extractionStatus = 'error';
    extractionResult = result;
    console.error('[profile] auto-extraction failed:', err);
  }
}

function maybeKickOffExtraction(items: Array<{ completion: number }>): void {
  if (extractionStatus !== 'idle') return;
  // At least 3 of the 6 core files have meaningful content.
  const filledCount = items.filter((i) => i.completion >= 30).length;
  if (filledCount < 3) return;
  if (hasAnyPopulatedSlots()) {
    // The user (or a previous run) has already populated some slots - skip.
    extractionStatus = 'completed';
    return;
  }
  extractionStatus = 'running';
  // Fire and forget.
  runFullExtraction().catch(() => {});
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

// ─── AI bridge connectivity ────────────────────────────────────────────────
//
// Surface whether the claude-bridge is up AND has the `claude` CLI binary
// available. The frontend uses this to render a clear "AI features need
// setup" banner instead of letting users hit silent extraction failures.
//
// We do NOT spend a real Claude call to test auth - that would burn tokens
// on every dashboard load. We only check the bridge is alive + the CLI is
// installed. If a real call later fails because auth was never run, the
// extraction_error field surfaces it.

type BridgeHealth = {
  ok: boolean;
  claude_bin: string | null;
  error: string | null;
};

async function checkBridgeHealth(): Promise<BridgeHealth> {
  // BRIDGE_URL is .../run - swap for /health.
  const healthUrl = BRIDGE_URL.replace(/\/run$/, '/health');
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { ok: false, claude_bin: null, error: `bridge returned ${res.status}` };
    const body = (await res.json()) as { ok?: boolean; claude_bin?: string };
    return {
      ok: body?.ok === true,
      claude_bin: body?.claude_bin ?? null,
      error: null,
    };
  } catch (err: any) {
    return {
      ok: false,
      claude_bin: null,
      error: err?.message ?? 'bridge unreachable',
    };
  }
}

app.get('/bridge-health', async (c) => {
  const h = await checkBridgeHealth();
  return c.json(h);
});

// The expected slot_* keys derived from Layer 2 - these are what extraction
// fills and what Reputation + Offer pages read from. Keeping this in sync
// with extractFromCore's SLOT_EXTRACT_PROMPT shape.
const EXPECTED_SLOTS = [
  'positioning_statement',
  'who_you_help',
  'before_state',
  'after_state',
  'transformation_result',
  'value_method',
  'value_step_1',
  'value_step_2',
  'value_step_3',
  'value_step_4',
  'value_step_5',
  'common_enemy',
  'core_named_mechanism',
  'pov_1_flip',
  'pov_2_flip',
  'pov_3_flip',
  'compressed_story',
  'transformation_statement',
];

function countPopulatedSlots(): { populated: number; total: number } {
  const total = EXPECTED_SLOTS.length;
  try {
    const state = loadFile(abs('00_System', 'state.md'));
    const fm = (state?.frontmatter ?? {}) as Record<string, unknown>;
    let populated = 0;
    for (const slot of EXPECTED_SLOTS) {
      const v = fm[`slot_${slot}`];
      if (typeof v === 'string' && v.trim().length > 0) populated++;
    }
    return { populated, total };
  } catch {
    return { populated: 0, total };
  }
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
  const slotCounts = countPopulatedSlots();

  maybeKickOffExtraction(items);

  return c.json({
    items,
    overall_completion: overall,
    // Layer 2 indicator: how many structured slot_* fields are actually populated
    // in state.md. A user can have 100% Layer 1 file completion (all 6 core files
    // exist and are full) but 0% Layer 2 slots until extraction runs. The UI
    // surfaces BOTH numbers so "100% complete" stops being a false positive.
    slots_populated: slotCounts.populated,
    slots_total: slotCounts.total,
    extraction_status: extractionStatus,
    extraction_result: extractionResult,
    extraction_error: extractionError,
  });
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
