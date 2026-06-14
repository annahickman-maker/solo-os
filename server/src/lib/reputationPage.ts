/**
 * Reputation page state - shape-faithful, vault-backed.
 *
 * The mental model:
 *   Personal brand = CONTENT VOLUME × ALIGNMENT WITH STATED BRAND
 *
 * Without content, your brand is essentially 0 regardless of how clearly you
 * define it. As content accumulates AND that content reflects the dimensions
 * you say you want to be known for, the score climbs.
 *
 * The overall score (0-100) is split:
 *   - 50 points come from CONTENT VOLUME  (log-ish curve over hours)
 *   - 50 points come from ALIGNMENT      (avg dim consistency × 50)
 *
 * Per-dimension scores are 0-5 (frontend uses `score / 5` ring). They're
 * linear in `consistency_pct` so they reflect "how often this lands in your
 * actual videos" without any harsh curve. Slot completion gives a small
 * additional credit when there's no analysis yet.
 *
 * Volume curve (hours of content tied to the transformation):
 *   0 hours   -> 0    points  (no brand without content)
 *   1 hour    -> 11   points
 *   5 hours   -> 25   points
 *   10 hours  -> 35   points
 *   12 hours  -> 38   points
 *   20 hours  -> 45   points
 *   50+ hours -> 50   points (full credit)
 *
 * Alignment is the avg of dimension consistency_pct from content analysis.
 *   80% avg alignment + 12 hours -> 38 + 40 = 78  (Resonating)
 *   50% avg alignment + 12 hours -> 38 + 25 = 63  (Building)
 *   30% avg alignment + 12 hours -> 38 + 15 = 53  (Building)
 */

import fs from 'node:fs';
import { abs, loadCollection, loadFile } from '../vault.js';
import { loadCachedAnalysis } from './contentAnalysis.js';

type Slots = Record<string, unknown>;

function getSlots(): Slots {
  return (loadFile(abs('00_System', 'state.md'))?.frontmatter as Slots) ?? {};
}

function slot(slots: Slots, key: string, fallback: any = null) {
  return slots[`slot_${key}`] ?? slots[key] ?? fallback;
}

function rating(slots: Slots, key: string, fallback = 0): number {
  const v = slots[`rating_${key}`];
  return typeof v === 'number' ? v : fallback;
}

function buildCompletion(slots: Slots, fieldKeys: string[]): number {
  if (fieldKeys.length === 0) return 0;
  const filled = fieldKeys.filter((k) => {
    const v = slot(slots, k);
    return typeof v === 'string' && v.trim().length > 0;
  }).length;
  return filled / fieldKeys.length;
}

// ─── Banks (loaded once, projected per-dimension) ──────────────────────────

type WinRaw = { id: string; title: string; body?: string; kind?: string; status?: string; date?: number; tags?: string[] };
type StoryRaw = { id: string; text: string; source_episode?: string; status?: string; tags?: string[] };

function loadJsonBank<T>(name: 'wins' | 'micro-stories' | 'proof-points' | 'teaching-frameworks'): T[] {
  try {
    return JSON.parse(fs.readFileSync(abs('00_System', `${name}.json`), 'utf8')) as T[];
  } catch {
    return [];
  }
}

type ApprovedBankRaw = {
  id: string;
  text: string;
  title?: string;
  context?: string;
  source_transcript?: string;
  source_timestamp?: string;
  source_moments?: Array<{ text: string; timestamp: string }>;
  created_at?: number;
};

type ApprovedBankEntry = {
  id: string;
  text: string;
  title: string | null;
  context: string | null;
  source_transcript: string | null;
  source_timestamp: string | null;
  source_moments: Array<{ text: string; timestamp: string }>;
  tags: string[];
  created_at: number | null;
};

function normalizeApproved(name: 'proof-points' | 'teaching-frameworks'): ApprovedBankEntry[] {
  return loadJsonBank<ApprovedBankRaw & { tags?: string[] }>(name).map((e) => ({
    id: e.id,
    text: e.text ?? '',
    title: e.title ?? null,
    context: e.context ?? null,
    source_transcript: e.source_transcript ?? null,
    source_timestamp: e.source_timestamp ?? null,
    source_moments: Array.isArray(e.source_moments) ? e.source_moments : [],
    tags: Array.isArray(e.tags) ? e.tags : [],
    created_at: e.created_at ?? null,
  })).filter((e) => e.text);
}

function loadWinsForDimension(): Array<{ id: string; title: string; body?: string | null; kind: 'own' | 'student' | 'client'; status: 'candidate' | 'confirmed' | 'rejected'; date?: number | null; tags?: string[] }> {
  return loadJsonBank<WinRaw>('wins').map((w) => ({
    id: w.id,
    title: w.title,
    body: w.body ?? null,
    kind: (w.kind === 'student' || w.kind === 'client') ? w.kind : 'own',
    status: (w.status === 'candidate' || w.status === 'rejected') ? w.status : 'confirmed',
    date: w.date ?? null,
    tags: w.tags ?? [],
  }));
}

function loadStoriesForDimension(): Array<{ id: string; text: string; source_episode?: string | null; source_transcript?: string | null; source_timestamp?: string | null; title?: string | null; source_moments?: Array<{ text: string; timestamp: string }>; status: 'candidate' | 'confirmed' | 'rejected'; tags?: string[] }> {
  // Now reads ONLY the verbatim approved-from-transcripts micro-stories. The
  // file gets reset on the creator's request - paraphrased entries are archived.
  return loadJsonBank<StoryRaw & ApprovedBankRaw>('micro-stories').map((s) => ({
    id: s.id,
    text: s.text,
    source_episode: s.source_episode ?? null,
    source_transcript: s.source_transcript ?? null,
    source_timestamp: s.source_timestamp ?? null,
    title: s.title ?? null,
    source_moments: Array.isArray(s.source_moments) ? s.source_moments : [],
    status: (s.status === 'confirmed' || s.status === 'rejected') ? s.status : 'candidate',
    tags: s.tags ?? [],
  }));
}

// ─── Story actions checklist (Connection dimension) ──────────────────────
// State is persisted as `slot_story_<id>` fields in 00_System/state.md
// ("1" = done, "0"/missing = not done). The PATCH endpoint at
// /api/reputation/story-actions/:id writes the right slot value.

const STORY_ACTION_DEFS: Array<{ id: string; label: string; hint?: string }> = [
  {
    id: 'published',
    label: 'Story published as a standalone piece of content',
    hint: 'Carousel, video, or written post that takes the audience through your before/turning-point/after.',
  },
  {
    id: 'on_ss_sales_page',
    label: 'Story embedded on the SS sales page',
    hint: 'The audience-mirroring story block as one of the first sections after the headline.',
  },
  {
    id: 'on_os_builds_page',
    label: 'Story embedded on the OS Builds page',
  },
  {
    id: 'on_about_page',
    label: 'Story embedded on the About page',
  },
  {
    id: 'pinned_on_yt',
    label: 'Compressed story pinned on YouTube channel',
  },
  {
    id: 'pinned_on_skool',
    label: 'Compressed story pinned in Skool community',
  },
];

function loadStoryActions(slots: Slots): Array<{ id: string; label: string; hint?: string; done: boolean }> {
  return STORY_ACTION_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    hint: def.hint,
    done: slot(slots, `story_${def.id}`) === '1' || slot(slots, `story_${def.id}`) === 1 || slot(slots, `story_${def.id}`) === true,
  }));
}

/**
 * Approved-from-transcript POVs - same source folder as the legacy pov_bank
 * (`05_Assets/POVs/asset_pov-*.md`), but filtered to entries that have a
 * `source_transcript` frontmatter field. These come from the vault approve
 * flow and we surface them in their own section so the creator can see what she's
 * banked from her actual speech, separate from her older authored POVs.
 */
function loadApprovedPovsFromTranscripts(): ApprovedBankEntry[] {
  const out: ApprovedBankEntry[] = [];
  for (const e of loadCollection('05_Assets/POVs', { type: 'pov' })) {
    const fm = e.frontmatter as any;
    if (!fm?.source_transcript) continue;
    const povSection = e.body.match(/##\s+POV\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
    const ctxSection = e.body.match(/##\s+Context\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
    const text = povSection ? povSection[1]!.trim() : e.body.trim();
    if (!text) continue;
    out.push({
      id: fm.id ?? e.id,
      text,
      title: fm.title ?? null,
      context: ctxSection ? ctxSection[1]!.trim() : null,
      source_transcript: fm.source_transcript ?? null,
      source_timestamp: fm.source_timestamp ?? null,
      source_moments: [],
      tags: Array.isArray(fm.topics) ? fm.topics : (Array.isArray(fm.tags) ? fm.tags.filter((t: string) => !t.startsWith('type/') && !t.startsWith('domain/')) : []),
      created_at: typeof fm.created === 'string'
        ? Math.floor(Date.parse(fm.created) / 1000) || null
        : null,
    });
  }
  return out;
}

function loadPOVsForDimension() {
  return loadCollection('05_Assets/POVs', { type: 'pov' }).map((e) => {
    const fm = e.frontmatter as any;
    const body = e.body;
    const grab = (heading: string) => {
      const re = new RegExp(`##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
      const m = body.match(re);
      return m ? m[1]!.trim() : null;
    };
    return {
      id: fm.id ?? e.id,
      title: fm.title ?? e.id,
      category: null,
      common_belief: grab('The Common Belief'),
      my_pov: grab('POV'),
      story_behind: grab('The Story Behind It'),
      how_i_use: grab("How I'd Use This In A Video"),
    };
  });
}

// ─── Output baseline ──────────────────────────────────────────────────────

function loadOutputBaseline(slots: Slots) {
  const videos = loadCollection('04_Channel/04_Projects', { type: 'video' }).filter(
    (e) => (e.frontmatter as any).status === 'published'
  );
  let totalSec = 0;
  let withTranscript = 0;
  let withDuration = 0;
  for (const v of videos) {
    const fm = v.frontmatter as any;
    const d = typeof fm.duration_sec === 'number' ? fm.duration_sec : 0;
    if (d > 0) {
      totalSec += d;
      withDuration++;
    }
    if (fm.has_transcript === true) withTranscript++;
    else if (typeof fm.youtube_id === 'string' && /## Transcript/.test(v.body)) withTranscript++;
  }
  return {
    total_long_form_hours: Math.round((totalSec / 3600) * 10) / 10,
    hours_on_transformation: (slot(slots, 'hours_on_transformation') as number) ?? 0,
    posting_consistency_90d: 0.5,
    current_streak_weeks: 0,
    multiplier: 1,
    tagged_count: withTranscript,
    untagged_count: Math.max(0, videos.length - withTranscript),
    missing_duration_count: videos.length - withDuration,
  };
}

const FRAMING =
  'Your brand is the context Claude works with. The more you fill out here and the more of it that shows up in your published content the better everything you ship sounds like you. Score goes up. Output gets sharper. Both at the same time.';

const DEFINITIONS = {
  value: 'Content that shifts belief, not just shares information. Insight over tips.',
  authority: 'Proof, not bragging. Specific numbers, specific timelines, specific people.',
  point_of_view: 'The thing you publicly argue with. Pick an enemy. Take stances inside videos.',
  connection: 'Relatability plus vulnerability. Stories that flip an admirer into a buyer.',
};

const DIMENSION_BUILD_FIELDS = {
  value: ['transformation_statement', 'value_method', 'value_step_1', 'value_step_2', 'value_step_3', 'value_step_4', 'value_step_5'],
  authority: ['own_proof_intro', 'own_proof_specific_numbers'],
  point_of_view: ['common_enemy', 'core_named_mechanism', 'pov_1_flip', 'pov_2_flip', 'pov_3_flip'],
  connection: ['compressed_story', 'my_story_text', 'story_audience_mapping'],
};

const COLORS = {
  value: 'var(--recovery)',
  authority: 'var(--strain)',
  point_of_view: 'var(--sleep)',
  connection: 'var(--hrv)',
};

// Per-dimension score (0-5). Linear in consistency_pct from the content
// analysis. Slot completion adds a small bonus when analysis is missing.
//   consistency 100% -> 5.0   80% -> 4.0   50% -> 2.5   20% -> 1.0
function scoreFromConsistency(consistencyPct: number): number {
  const x = Math.max(0, Math.min(100, consistencyPct)) / 100;
  return Math.round(x * 5 * 10) / 10;
}

function buildDimension(id: keyof typeof DEFINITIONS, slots: Slots, analysisDim: { consistency_pct?: number } | undefined) {
  const fields = DIMENSION_BUILD_FIELDS[id];
  const buildPct = buildCompletion(slots, fields);
  const ratingAvg = fields.reduce((acc, f) => acc + rating(slots, f, 0), 0) / Math.max(1, fields.length);
  const activationScore = ratingAvg > 0 ? ratingAvg / 5 : 0;

  // Primary signal: how the dimension actually shows up in published videos.
  // Without analysis yet, fall back to a small credit from slot completion
  // (your brand being defined on paper, but unproven in content).
  let score: number;
  if (analysisDim && typeof analysisDim.consistency_pct === 'number') {
    score = scoreFromConsistency(analysisDim.consistency_pct);
  } else {
    score = Math.round(buildPct * 1.5 * 10) / 10;
  }

  const baseDim: any = {
    id,
    label: id === 'value' ? 'Value' : id === 'authority' ? 'Authority' : id === 'point_of_view' ? 'Point of View' : 'Connection',
    color: COLORS[id],
    weight: 0.25,
    definition: DEFINITIONS[id],
    build_completion: buildPct,
    activation_score: activationScore,
    output_multiplier_applied: 1,
    score,
    build: fields.map((f) => ({
      id: f,
      label: f.replace(/_/g, ' '),
      source: '00_System/state.md',
      value: slot(slots, f),
      filled: !!slot(slots, f),
      prompt: '',
    })),
    activate: [],
    anti_patterns: [],
  };

  // Embed dimension-specific banks so the frontend renders them.
  if (id === 'authority') {
    baseDim.wins_bank = loadWinsForDimension();
    baseDim.proof_bank = normalizeApproved('proof-points');
    // The Promise: one-sentence specific outcome + timeframe the creator's current
    // offer delivers. The pinned proof IDs point at the specific wins +
    // bank entries that demonstrate this promise is possible.
    baseDim.promise = slot(slots, 'promise_text') ?? null;
    const rawPinned = slot(slots, 'pinned_proof_ids');
    baseDim.pinned_proof_ids = Array.isArray(rawPinned)
      ? rawPinned.filter((x: unknown) => typeof x === 'string')
      : typeof rawPinned === 'string' && rawPinned.length > 0
        ? rawPinned.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];
  }
  if (id === 'value') {
    baseDim.frameworks_bank = normalizeApproved('teaching-frameworks');
  }
  if (id === 'point_of_view') {
    baseDim.pov_bank = loadPOVsForDimension();
    baseDim.pov_transcript_bank = loadApprovedPovsFromTranscripts();
  }
  if (id === 'connection') {
    baseDim.micro_stories = loadStoriesForDimension();
    baseDim.story_actions = loadStoryActions(slots);
    baseDim.story_core = slot(slots, 'my_story_text') ?? null;
    baseDim.story_compressed = slot(slots, 'compressed_story') ?? null;
  }

  return baseDim;
}

function maturityFromOverall(overall: number) {
  if (overall >= 80) return { id: 'compounding', label: 'Compounding', description: 'Inbound replaces outreach. Reputation compounds.' };
  if (overall >= 60) return { id: 'resonating', label: 'Resonating', description: 'All 4 ingredients present. People comment "this feels like you wrote it for me."' };
  if (overall >= 40) return { id: 'building', label: 'Building', description: 'Substantial content body. Some ingredients consistently strong.' };
  if (overall >= 20) return { id: 'validating', label: 'Validating', description: 'One transformation chosen, content starting to ladder to it.' };
  return { id: 'scattered', label: 'Scattered', description: 'Not enough content yet to compound. Build the body of work first.' };
}

// Content volume curve: 0-50 points. Log-ish so each additional hour adds
// less than the last. 50 hours = full credit. 12 hours = 38.
function volumeScoreFromHours(hours: number): number {
  if (hours <= 0) return 0;
  // sqrt(h/20) saturates at 20 hours (= 50), curves nicely for smaller hours.
  const x = Math.min(1, Math.sqrt(hours / 20));
  return Math.round(x * 50);
}

export function buildReputationResponse() {
  const slots = getSlots();
  const cached = loadCachedAnalysis();
  const analysisById = new Map<string, { consistency_pct?: number }>();
  for (const d of cached?.dimensions ?? []) analysisById.set(d.id, d);

  const dims = (['value', 'authority', 'point_of_view', 'connection'] as const).map((id) =>
    buildDimension(id, slots, analysisById.get(id))
  );

  // Overall = content volume score + alignment score, each 0-50.
  // Volume: hours of published content (uses content analysis hours if known).
  // Alignment: average dim consistency (how well content matches stated brand).
  const baseline = loadOutputBaseline(slots);
  const hours = Math.max(baseline.total_long_form_hours, baseline.hours_on_transformation);
  const volume_score = volumeScoreFromHours(hours);
  // alignment_avg is 0-1 across the 4 dimensions
  const alignment_avg = dims.reduce((a, b) => a + b.score, 0) / (dims.length * 5);
  const alignment_score = Math.round(alignment_avg * 50);
  const overall = volume_score + alignment_score;

  const transformation_anchor = {
    positioning_statement: slot(slots, 'positioning_statement'),
    who_you_help: slot(slots, 'who_you_help', ''),
    before_state: slot(slots, 'before_state', ''),
    after_state: slot(slots, 'after_state', ''),
    transformation_result: slot(slots, 'transformation_result', ''),
    value_share_tags: Array.isArray(slot(slots, 'value_share_tags')) ? slot(slots, 'value_share_tags') : [],
    value_dont_share_tags: Array.isArray(slot(slots, 'value_dont_share_tags')) ? slot(slots, 'value_dont_share_tags') : [],
  };

  const FIELD_IDS = ['positioning_statement', 'who_you_help', 'before_state', 'after_state', 'transformation_result'];
  const brand_profile = {
    fields: FIELD_IDS.map((f) => ({ id: f, label: f.replace(/_/g, ' '), value: slot(slots, f), filled: !!slot(slots, f) })),
    completion: buildCompletion(slots, FIELD_IDS),
  };

  const suggestions = cached
    ? cached.dimensions.flatMap((d) =>
        d.opportunities.slice(0, 1).map((opp) => ({
          dimension: d.id,
          what_i_noticed: d.what_claude_noticed,
          why_it_matters: '',
          do_this: opp,
        }))
      )
    : [];

  return {
    overall_score: overall,
    score_breakdown: {
      volume_score,
      alignment_score,
      hours_of_content: hours,
    },
    framing: FRAMING,
    transformation_anchor,
    brand_profile,
    output_baseline: baseline,
    dimensions: dims,
    suggestions,
    maturity_stage: maturityFromOverall(overall),
  };
}
