/**
 * Foundation - Layer 2 artifact map.
 *
 * Surfaces the populated vs missing state of every Layer 2 store the
 * dashboard reads (slot_* fields in state.md, avatars, POVs, proof bank,
 * offer rungs, journey timeline, audience quotes, wins). Replaces the
 * Profile page's "100% complete" false positive with an honest map of
 * what's actually populated and what is still missing.
 *
 * Read-only for now - editing happens via the existing per-artifact
 * routes (offers, journey, povs, etc.). This is a dashboard of dashboards.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { abs, loadFile } from '../vault.js';

type ArtifactKind =
  | 'slot'
  | 'avatar'
  | 'pov'
  | 'proof'
  | 'offer_rung'
  | 'journey_entry'
  | 'audience_quote'
  | 'win';

type ArtifactGroup = {
  id: string;
  kind: ArtifactKind;
  label: string;
  populated: number;
  total: number | null;     // null = unbounded (no fixed target)
  filled_pct: number | null;
  source_path: string;
  source_layer1: string | null; // which core file this group's data is summarised in
  status: 'empty' | 'partial' | 'populated' | 'unknown';
  latest_preview: string | null;
  recent: Array<{ id?: string; title?: string; preview?: string }>;
  missing_hints: string[];
};

const app = new Hono();

// The 18 expected slot_* fields (keep in sync with profile.ts EXPECTED_SLOTS).
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

function readStateFm(): Record<string, unknown> {
  try {
    const state = loadFile(abs('00_System', 'state.md'));
    return (state?.frontmatter ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readJsonFile<T = any>(rel: string[]): T | null {
  try {
    const raw = fs.readFileSync(abs(...rel), 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function countMdFiles(rel: string[]): { count: number; files: string[] } {
  try {
    const dir = abs(...rel);
    const items = fs.readdirSync(dir).filter((f) =>
      f.endsWith('.md') && !f.startsWith('_') && !f.startsWith('.')
    );
    return { count: items.length, files: items };
  } catch {
    return { count: 0, files: [] };
  }
}

function previewBody(filePath: string, max: number): string {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    // Strip yaml frontmatter
    const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^#.*$/gm, '').trim();
    return body.replace(/\s+/g, ' ').slice(0, max);
  } catch {
    return '';
  }
}

function statusFor(populated: number, total: number | null): 'empty' | 'partial' | 'populated' | 'unknown' {
  if (total === null) return populated > 0 ? 'populated' : 'empty';
  if (total === 0) return 'unknown';
  const pct = populated / total;
  if (pct === 0) return 'empty';
  if (pct >= 0.85) return 'populated';
  return 'partial';
}

function pct(populated: number, total: number | null): number | null {
  if (total === null || total === 0) return null;
  return Math.round((populated / total) * 100);
}

app.get('/', (c) => {
  const groups: ArtifactGroup[] = [];

  // ─── 1. slot_* fields in state.md ────────────────────────────────────────
  const fm = readStateFm();
  let slotsPop = 0;
  const missingSlots: string[] = [];
  for (const slot of EXPECTED_SLOTS) {
    const v = fm[`slot_${slot}`];
    if (typeof v === 'string' && v.trim().length > 0) {
      slotsPop++;
    } else {
      missingSlots.push(slot);
    }
  }
  groups.push({
    id: 'slots',
    kind: 'slot',
    label: 'Brand profile slots',
    populated: slotsPop,
    total: EXPECTED_SLOTS.length,
    filled_pct: pct(slotsPop, EXPECTED_SLOTS.length),
    source_path: '00_System/state.md',
    source_layer1: '01_Core/core_positioning.md, core_audience.md, core_ip.md, core_my-story.md',
    status: statusFor(slotsPop, EXPECTED_SLOTS.length),
    latest_preview: typeof fm.slot_positioning_statement === 'string' ? (fm.slot_positioning_statement as string).slice(0, 120) : null,
    recent: EXPECTED_SLOTS.slice(0, 5)
      .filter((s) => typeof fm[`slot_${s}`] === 'string' && (fm[`slot_${s}`] as string).trim())
      .map((s) => ({ id: s, title: s, preview: (fm[`slot_${s}`] as string).slice(0, 100) })),
    missing_hints: missingSlots.slice(0, 5).map((s) => `slot_${s}`),
  });

  // ─── 2. Avatars in 05_Assets/Avatars/ ────────────────────────────────────
  const avatarFiles = countMdFiles(['05_Assets', 'Avatars']);
  const avatarPreviews = avatarFiles.files.slice(0, 3).map((f) => ({
    id: f.replace(/\.md$/, ''),
    title: f.replace(/^avatar-/, '').replace(/\.md$/, ''),
    preview: previewBody(abs('05_Assets', 'Avatars', f), 140),
  }));
  groups.push({
    id: 'avatars',
    kind: 'avatar',
    label: 'Audience avatars',
    populated: avatarFiles.count,
    total: null,
    filled_pct: null,
    source_path: '05_Assets/Avatars/',
    source_layer1: '01_Core/core_audience.md',
    status: avatarFiles.count > 0 ? 'populated' : 'empty',
    latest_preview: avatarPreviews[0]?.preview ?? null,
    recent: avatarPreviews,
    missing_hints: avatarFiles.count === 0 ? ['avatar-<name>.md - generate from core_audience.md via extraction'] : [],
  });

  // ─── 3. POV files in 05_Assets/POVs/ ─────────────────────────────────────
  const povFiles = countMdFiles(['05_Assets', 'POVs']);
  const povPreviews = povFiles.files.slice(0, 3).map((f) => ({
    id: f.replace(/\.md$/, ''),
    title: f.replace(/^asset_pov-/, '').replace(/\.md$/, '').replace(/-/g, ' '),
    preview: previewBody(abs('05_Assets', 'POVs', f), 140),
  }));
  groups.push({
    id: 'povs',
    kind: 'pov',
    label: 'POV bank',
    populated: povFiles.count,
    total: null,
    filled_pct: null,
    source_path: '05_Assets/POVs/',
    source_layer1: '01_Core/core_ip.md (foundational beliefs)',
    status: povFiles.count > 0 ? 'populated' : 'empty',
    latest_preview: povPreviews[0]?.preview ?? null,
    recent: povPreviews,
    missing_hints: povFiles.count === 0 ? ['asset_pov-*.md - one file per foundational belief'] : [],
  });

  // ─── 4. Proof bank (asset_proof.md) ───────────────────────────────────────
  let proofCount = 0;
  let proofPreview: string | null = null;
  try {
    const proof = fs.readFileSync(abs('05_Assets', 'Proof', 'asset_proof.md'), 'utf8');
    proofCount = (proof.match(/^[-*]\s+/gm) || []).length;
    proofPreview = previewBody(abs('05_Assets', 'Proof', 'asset_proof.md'), 140);
  } catch {}
  // Also count proof-points.json (separate bank)
  const proofPoints = readJsonFile<Array<{ id: string; title?: string; text?: string }>>(['00_System', 'proof-points.json']) ?? [];
  const proofTotal = proofCount + proofPoints.length;
  groups.push({
    id: 'proof',
    kind: 'proof',
    label: 'Proof bank',
    populated: proofTotal,
    total: null,
    filled_pct: null,
    source_path: '05_Assets/Proof/asset_proof.md + 00_System/proof-points.json',
    source_layer1: '01_Core/core_my-story.md (results) + transcripts',
    status: proofTotal > 0 ? 'populated' : 'empty',
    latest_preview: proofPreview,
    recent: proofPoints.slice(0, 3).map((p) => ({
      id: p.id,
      title: p.title ?? (p.text ? p.text.slice(0, 40) : ''),
      preview: p.text?.slice(0, 140),
    })),
    missing_hints: proofTotal === 0 ? ['asset_proof.md - your brag bank of named results'] : [],
  });

  // ─── 5. Offer rungs (offer-pricing-rungs.json) ───────────────────────────
  const rungs = readJsonFile<Array<{ id: string; name?: string; tier?: string; price_label?: string; promise?: string }>>(['00_System', 'offer-pricing-rungs.json']) ?? [];
  const filledRungs = rungs.filter((r) => (r.name ?? '').trim().length > 0).length;
  groups.push({
    id: 'offer_rungs',
    kind: 'offer_rung',
    label: 'Offer rungs',
    populated: filledRungs,
    total: rungs.length || null,
    filled_pct: rungs.length > 0 ? Math.round((filledRungs / rungs.length) * 100) : null,
    source_path: '00_System/offer-pricing-rungs.json',
    source_layer1: '01_Core/core_offer-suite.md',
    status: filledRungs > 0 ? (filledRungs >= 2 ? 'populated' : 'partial') : 'empty',
    latest_preview: rungs[0]?.promise ?? null,
    recent: rungs.slice(0, 3).map((r) => ({
      id: r.id,
      title: r.name || `(${r.tier ?? 'untitled'})`,
      preview: r.promise,
    })),
    missing_hints: rungs.length === 0 ? ['low/mid/high rungs - generate from core_offer-suite.md via extraction'] : [],
  });

  // ─── 6. Journey timeline (journey-timeline.json) ──────────────────────────
  const journeyRaw = readJsonFile<{ entries?: any[] } | any[]>(['00_System', 'journey-timeline.json']);
  let journeyEntries: any[] = [];
  if (Array.isArray(journeyRaw)) journeyEntries = journeyRaw;
  else if (journeyRaw && Array.isArray(journeyRaw.entries)) journeyEntries = journeyRaw.entries;
  groups.push({
    id: 'journey',
    kind: 'journey_entry',
    label: 'Journey timeline',
    populated: journeyEntries.length,
    total: null,
    filled_pct: null,
    source_path: '00_System/journey-timeline.json',
    source_layer1: '01_Core/core_my-story.md (chapters)',
    status: journeyEntries.length > 0 ? 'populated' : 'empty',
    latest_preview: journeyEntries[0]?.title ?? null,
    recent: journeyEntries.slice(0, 3).map((e) => ({
      id: e.id,
      title: e.title,
      preview: `${e.date} · ${e.type} · ${e.body ?? ''}`.slice(0, 140),
    })),
    missing_hints: journeyEntries.length === 0 ? ['journey-timeline.json entries - extract from your story chapters'] : [],
  });

  // ─── 7. Audience quotes (audience-quotes.json) ───────────────────────────
  // File shape varies - sometimes an array, sometimes { quotes: [...] }.
  const audienceQuotesRaw = readJsonFile<any>(['00_System', 'audience-quotes.json']);
  const audienceQuotes: any[] = Array.isArray(audienceQuotesRaw)
    ? audienceQuotesRaw
    : Array.isArray(audienceQuotesRaw?.quotes)
    ? audienceQuotesRaw.quotes
    : [];
  const approvedQuotes = audienceQuotes.filter((q) => q && q.status !== 'dismissed').length;
  groups.push({
    id: 'audience_quotes',
    kind: 'audience_quote',
    label: 'Audience quotes',
    populated: approvedQuotes,
    total: null,
    filled_pct: null,
    source_path: '00_System/audience-quotes.json',
    source_layer1: '05_Assets/Transcripts/ (extracted from Q&A calls)',
    status: approvedQuotes > 0 ? 'populated' : 'empty',
    latest_preview: audienceQuotes[0]?.text?.slice(0, 140) ?? null,
    recent: audienceQuotes.slice(0, 3).map((q) => ({
      id: q.id,
      title: q.title ?? q.speaker_label,
      preview: q.text?.slice(0, 140),
    })),
    missing_hints: approvedQuotes === 0 ? ['drop a Q&A call transcript in 05_Assets/Transcripts/QA-Calls/ and run extraction'] : [],
  });

  // ─── 8. Wins bank (wins.json) ────────────────────────────────────────────
  const wins = readJsonFile<any[]>(['00_System', 'wins.json']) ?? [];
  groups.push({
    id: 'wins',
    kind: 'win',
    label: 'Wins bank',
    populated: wins.length,
    total: null,
    filled_pct: null,
    source_path: '00_System/wins.json',
    source_layer1: '01_Core/core_my-story.md + asset_proof.md',
    status: wins.length > 0 ? 'populated' : 'empty',
    latest_preview: wins[0]?.title ?? null,
    recent: wins.slice(0, 3).map((w) => ({
      id: w.id,
      title: w.title,
      preview: w.body?.slice(0, 140),
    })),
    missing_hints: wins.length === 0 ? ['wins extracted from your story - run /api/seed/from-core?target=wins'] : [],
  });

  // ─── Summary ──────────────────────────────────────────────────────────────
  const populatedCount = groups.filter((g) => g.status === 'populated').length;
  const partialCount = groups.filter((g) => g.status === 'partial').length;
  const emptyCount = groups.filter((g) => g.status === 'empty').length;
  const totalGroups = groups.length;
  const overallPct = Math.round(((populatedCount + partialCount * 0.5) / totalGroups) * 100);

  return c.json({
    groups,
    summary: {
      total_groups: totalGroups,
      populated: populatedCount,
      partial: partialCount,
      empty: emptyCount,
      overall_pct: overallPct,
    },
  });
});

export default app;
