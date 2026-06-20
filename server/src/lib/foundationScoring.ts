/**
 * Foundation scoring - Claude reads the actual slot + bank content for each
 * reputation dimension and rates QUALITY, not just presence. The numeric
 * heuristic in reputationPage.ts can't tell substantive content from stubs;
 * this fills that gap by asking a model that can actually read.
 *
 * Scoring criteria, weighted differently per dimension:
 *   - clarity      - is the content actually clear?
 *   - depth        - paragraph that holds water, or one-line stub?
 *   - distinctness - would this stand out, or could anyone have written it?
 *   - transformation_alignment - does it tie to the transformation statement?
 *   - relevance    - is it on-topic for this dimension?
 *
 * Connection deweights transformation_alignment because stories often work
 * obliquely. Authority deweights relevance because raw wins ARE the authority.
 *
 * Cached at 00_System/reputation-foundation-scores.json. Treated as stale and
 * re-runnable from the UI (refresh button) - we do NOT auto-refresh on every
 * page load because each run costs a Claude call.
 */

import fs from 'node:fs';
import { abs, loadCollection, loadFile } from '../vault.js';
import { BRIDGE_URL } from './bridge.js';

const CACHE_FILE_REL = ['00_System', 'reputation-foundation-scores.json'] as const;

export type FoundationDimensionId = 'value' | 'authority' | 'point_of_view' | 'connection';

export interface DimensionFoundationScore {
  id: FoundationDimensionId;
  label: string;
  baseline: number; // numeric heuristic score handed to Claude
  score: number; // final score after Claude's quality adjustments
  adjustments: {
    clarity: number; // -0.5 to +0.2
    depth: number;
    distinctness: number;
    transformation_alignment: number;
    relevance: number;
  };
  total_adjustment: number; // -2.5 to +1.0
  what_claude_noticed: string;
  what_to_strengthen: string[];
}

export interface FoundationScoresResult {
  generated_at: number;
  model: string;
  dimensions: DimensionFoundationScore[];
  // Hash of the input content so we can mark stale when slots/banks change.
  input_hash: string;
}

const SYSTEM_PROMPT = `
You are a QUALITY critic of a creator's brand foundation. The numeric baseline
you receive already accounts for slot completion and bank size (presence +
volume). Your job is to ADJUST that baseline based on QUALITY of the content
that exists - up or down.

DO NOT double-count what the baseline already counted. Empty banks and empty
slots are already in the baseline. Your adjustments are for the content that
EXISTS - is it stubby vs substantive, generic vs distinctive, vague vs sharp?

You can both ADD and SUBTRACT, but adjustments are asymmetric:
  - Subtractions per criterion: 0 to -0.5 (easy to take points off)
  - Additions per criterion:    0 to +0.2 (hard to earn points)
This makes the total adjustment range -2.5 to +1.0. Additions are reserved for
content that meaningfully exceeds what bank-size-alone would suggest. Default
to neutral (0) - only adjust when there's a real reason.

Criteria (each -0.5 to +0.2):

1. CLARITY      - filled slots vague vs specific. Negative for undefined jargon
   (e.g. "Solopreneur OS" with no explanation). Positive for sharp, named
   concepts with clear sentences.

2. DEPTH        - one-line stub vs substantive paragraph. Negative for slot
   values under 50 chars when they should be 200+. Negative for bank entries
   under 100 chars. Positive for bank entries with rich context and specifics.

3. DISTINCTNESS - generic vs uniquely theirs. Negative for safe truisms,
   anything that could be written by any consultant in the industry. Positive
   for genuinely contrarian stances backed with specifics, named-counter-belief
   POVs, named-enemy with quoteable specificity.

4. TRANSFORMATION_ALIGNMENT - drift vs ladder. Negative for content that
   doesn't connect to the stated transformation. Positive for content that
   visibly ladders to the same outcome. Connection gets less weight here -
   stories work obliquely.

5. RELEVANCE    - off-topic vs on-job. Negative for content that's filed under
   the wrong dimension (POV entries that are really stories, Authority slots
   that talk about philosophy not proof). Positive for content that does
   exactly this dimension's job.

PER-DIMENSION ANCHORS:

VALUE
- A great VALUE step explains: what the principle is, WHY it works, and HOW to
  execute it. A bare label or single sentence is a stub - deduct DEPTH 0.2-0.4.
- A teaching framework with sensory detail (named, with concrete components)
  earns CLARITY +0.1.

AUTHORITY
- Wins with dollar amounts, dates, and specific outcomes earn CLARITY +0.1.
- Authority slots that exist but don't tie wins to a coherent narrative
  deduct RELEVANCE 0.2-0.3 (the wins do the work, but the slot should orient them).

POINT_OF_VIEW (apply strict standards)
- A great POV has: (1) named common belief, (2) named counter-belief, (3)
  specific reason or proof for the flip, (4) ideally a named example or story.
- POV entries that name a belief and a flip but DON'T explain WHY the flip is
  correct deduct DEPTH 0.2-0.3.
- POVs whose flip reads as a generic "be better" or "do less but better" deduct
  DISTINCTNESS 0.2-0.3 - the flip needs to be uncomfortable, not common sense.
- Template/example placeholder entries in the bank deduct RELEVANCE 0.2.
- Bonus +0.1-0.2 distinctness only for POVs with specific quoted language or
  named counter-frameworks (e.g. "not Atomic Habits, but X").

CONNECTION (be generous on quality)
- Specific micro-stories with sensory detail, concrete moments, named places
  or times, real emotional beats earn DEPTH +0.2 and DISTINCTNESS +0.1.
- If 10+ micro-stories show clear specificity (proper nouns, dates, dialogue,
  sensory detail), add +0.3 across criteria - this overdelivers vs baseline.
- Missing my_story_text deducts RELEVANCE 0.3 (the spine is missing) but does
  NOT cancel the bank's specificity bonus.
- Connection content earns positive adjustments more readily than other
  dimensions because rich story material is rare and hard to fake.

OUTPUT FORMAT (strict JSON, no markdown fences):
{
  "dimensions": [
    {
      "id": "value",
      "baseline_received": 3.0,
      "adjustments": {
        "clarity": -0.1,
        "depth": -0.3,
        "distinctness": 0.0,
        "transformation_alignment": 0.0,
        "relevance": 0.0
      },
      "final_score": 2.6,
      "what_claude_noticed": "one sentence on the most-influential adjustment",
      "what_to_strengthen": ["concrete fix 1", "concrete fix 2", "concrete fix 3"]
    },
    ... (one entry per dimension: value, authority, point_of_view, connection)
  ]
}

Compute final_score yourself: max(0, min(5, baseline + sum(adjustments))).

Be conservative. Default to 0 per criterion. Adjust only when there is a real,
specific reason that can be pointed at in the content.
`.trim();

// ─── Input gathering ──────────────────────────────────────────────────────

function readSlot(slots: any, key: string): string {
  const v = slots?.[`slot_${key}`];
  if (typeof v === 'string') return v.trim();
  if (v == null) return '';
  return String(v).trim();
}

function loadStateSlots(): Record<string, unknown> {
  // loadFile returns { frontmatter, body, ... } - frontmatter is already a
  // parsed YAML object via gray-matter. Use it directly instead of re-parsing.
  const entry = loadFile(abs('00_System', 'state.md'));
  return (entry?.frontmatter as Record<string, unknown>) ?? {};
}

function loadJsonBank<T>(name: string): T[] {
  try {
    const raw = fs.readFileSync(abs('00_System', `${name}.json`), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadPOVEntries(): Array<{ title: string; body: string }> {
  return loadCollection('05_Assets/POVs', { type: 'pov' }).map((e) => ({
    title: e.title || e.slug,
    body: e.body.slice(0, 2000),
  }));
}

function bullet(items: string[], max: number): string {
  return items.slice(0, max).map((x) => `- ${x}`).join('\n');
}

function buildUserPrompt(baselines: Record<FoundationDimensionId, number>): { text: string; inputHash: string } {
  const slots = loadStateSlots();
  const transformation_statement = readSlot(slots, 'transformation_statement') || '(not set)';

  const valueSlots = {
    transformation_statement: readSlot(slots, 'transformation_statement'),
    value_method: readSlot(slots, 'value_method'),
    value_step_1: readSlot(slots, 'value_step_1'),
    value_step_2: readSlot(slots, 'value_step_2'),
    value_step_3: readSlot(slots, 'value_step_3'),
    value_step_4: readSlot(slots, 'value_step_4'),
    value_step_5: readSlot(slots, 'value_step_5'),
  };
  const authoritySlots = {
    own_proof_intro: readSlot(slots, 'own_proof_intro'),
    own_proof_specific_numbers: readSlot(slots, 'own_proof_specific_numbers'),
  };
  const povSlots = {
    common_enemy: readSlot(slots, 'common_enemy'),
    core_named_mechanism: readSlot(slots, 'core_named_mechanism'),
    pov_1_flip: readSlot(slots, 'pov_1_flip'),
    pov_2_flip: readSlot(slots, 'pov_2_flip'),
    pov_3_flip: readSlot(slots, 'pov_3_flip'),
  };
  const connectionSlots = {
    compressed_story: readSlot(slots, 'compressed_story'),
    my_story_text: readSlot(slots, 'my_story_text'),
    story_audience_mapping: readSlot(slots, 'story_audience_mapping'),
  };

  const wins = loadJsonBank<any>('wins');
  const microStories = loadJsonBank<any>('micro-stories');
  const proofPoints = loadJsonBank<any>('proof-points');
  const frameworks = loadJsonBank<any>('teaching-frameworks');
  const povs = loadPOVEntries();

  function slotBlock(name: string, obj: Record<string, string>): string {
    const lines = Object.entries(obj).map(([k, v]) => `  - ${k}: ${v ? JSON.stringify(v) : '(empty)'}`);
    return `### ${name} slots\n${lines.join('\n')}`;
  }

  const baselineHeader = `
# NUMERIC BASELINE SCORES (deduct from these, never add)
- value:        ${baselines.value.toFixed(1)} / 5
- authority:    ${baselines.authority.toFixed(1)} / 5
- point_of_view: ${baselines.point_of_view.toFixed(1)} / 5
- connection:   ${baselines.connection.toFixed(1)} / 5
`.trim();
  const contentBody = `
# TRANSFORMATION STATEMENT (anchor for transformation_alignment scoring)
${transformation_statement}

# CREATOR'S FOUNDATION CONTENT BY DIMENSION

## VALUE
${slotBlock('VALUE', valueSlots)}

### VALUE bank: teaching-frameworks (${frameworks.length})
${
  bullet(
    frameworks.map((f: any) => safeStr(f.title || f.name)),
    20
  ) || '(empty)'
}

## AUTHORITY
${slotBlock('AUTHORITY', authoritySlots)}

### AUTHORITY bank: wins (${wins.length})
${
  bullet(
    wins.map((w: any) => {
      const title = safeStr(w.title);
      const body = safeStr(w.body).slice(0, 300);
      const metric = safeStr(w.metric);
      return `${title}${metric ? ` [${metric}]` : ''}${body ? ` - ${body}` : ''}`;
    }),
    20
  ) || '(empty)'
}

### AUTHORITY bank: proof-points (${proofPoints.length})
${
  bullet(
    proofPoints.map((p: any) => safeStr(p.title || p.text).slice(0, 200)),
    15
  ) || '(empty)'
}

## POINT_OF_VIEW
${slotBlock('POINT_OF_VIEW', povSlots)}

### POV bank entries (${povs.length})
${
  povs
    .slice(0, 12)
    .map(
      (p, i) => `[${i + 1}] ${p.title}\n${p.body.slice(0, 600).replace(/\n+/g, ' ')}`
    )
    .join('\n\n') || '(empty)'
}

## CONNECTION
${slotBlock('CONNECTION', connectionSlots)}

### CONNECTION bank: micro-stories (${microStories.length})
${
  bullet(
    microStories.map((s: any) => safeStr(s.text).slice(0, 350)),
    15
  ) || '(empty)'
}
`.trim();

  const text = `${baselineHeader}\n\n${contentBody}`;
  // Hash content only (excluding the baseline header) so the cache stays fresh
  // when only the baseline shifts. The baseline is fully determined by the
  // content anyway.
  const inputHash = simpleHash(contentBody);
  return { text, inputHash };
}

function safeStr(v: any): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

// Lightweight, deterministic, non-cryptographic. Just used to detect change.
function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

// ─── Claude call + parse ──────────────────────────────────────────────────

async function callClaude(system: string, user: string): Promise<string> {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'foundationScoring',
      system,
      user,
      maxTokens: 3000,
      expectJson: true,
    }),
  });
  if (!res.ok) throw new Error(`claude-bridge ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { text?: string; error?: string };
  if (data.error) throw new Error(`claude-bridge: ${data.error}`);
  if (!data.text) throw new Error('claude-bridge: no text in response');
  return data.text;
}

function clampScore(v: any, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 5) return 5;
  return Math.round(n * 10) / 10;
}

const LABELS: Record<FoundationDimensionId, string> = {
  value: 'Value',
  authority: 'Authority',
  point_of_view: 'Point of View',
  connection: 'Connection',
};

/**
 * Compute the numeric heuristic baselines from the same formula used in
 * reputationPage.ts. Centralised here so the prompt sees exactly what the
 * dashboard would have shown without Claude. Kept in sync intentionally.
 */
function computeNumericBaselines(): Record<FoundationDimensionId, number> {
  const slots = loadStateSlots();
  const SCORING: Record<FoundationDimensionId, { slotWeight: number; bankWeight: number; bankTarget: number; slotKeys: string[] }> = {
    value: {
      slotWeight: 0.6,
      bankWeight: 0.4,
      bankTarget: 8,
      slotKeys: ['transformation_statement', 'value_method', 'value_step_1', 'value_step_2', 'value_step_3', 'value_step_4', 'value_step_5'],
    },
    authority: {
      slotWeight: 0.2,
      bankWeight: 0.8,
      bankTarget: 8,
      slotKeys: ['own_proof_intro', 'own_proof_specific_numbers'],
    },
    point_of_view: {
      slotWeight: 0.5,
      bankWeight: 0.5,
      bankTarget: 12,
      slotKeys: ['common_enemy', 'core_named_mechanism', 'pov_1_flip', 'pov_2_flip', 'pov_3_flip'],
    },
    connection: {
      slotWeight: 0.5,
      bankWeight: 0.5,
      bankTarget: 18,
      slotKeys: ['compressed_story', 'my_story_text', 'story_audience_mapping'],
    },
  };
  const bankSizes: Record<FoundationDimensionId, number> = {
    value: loadJsonBank('teaching-frameworks').length,
    authority: loadJsonBank('wins').length + loadJsonBank('proof-points').length,
    point_of_view: loadPOVEntries().length,
    connection: loadJsonBank('micro-stories').length,
  };
  const out: Record<FoundationDimensionId, number> = { value: 0, authority: 0, point_of_view: 0, connection: 0 };
  for (const id of ['value', 'authority', 'point_of_view', 'connection'] as const) {
    const cfg = SCORING[id];
    const filled = cfg.slotKeys.filter((k) => {
      const v = readSlot(slots, k);
      return typeof v === 'string' && v.length > 0;
    }).length;
    const slotPct = cfg.slotKeys.length > 0 ? filled / cfg.slotKeys.length : 0;
    const bankPct = cfg.bankTarget > 0 ? Math.min(1, bankSizes[id] / cfg.bankTarget) : 0;
    out[id] = Math.round((slotPct * cfg.slotWeight + bankPct * cfg.bankWeight) * 5 * 10) / 10;
  }
  return out;
}

export async function runFoundationScoring(): Promise<FoundationScoresResult> {
  const baselines = computeNumericBaselines();
  const { text, inputHash } = buildUserPrompt(baselines);
  const raw = await callClaude(SYSTEM_PROMPT, text);

  // Tolerate fenced blocks + trailing commas.
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('could not parse json from foundation scoring response');
    parsed = JSON.parse(match[0]);
  }

  // Each adjustment is asymmetric: -0.5 to +0.2 per criterion. Total can range
  // -2.5 to +1.0. Final = clamp(baseline + sum_of_adjustments, 0, 5). Baseline
  // already captured presence/absence; these adjustments are pure quality
  // signal on the content that exists.
  function clampAdjustment(v: any): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    if (n < -0.5) return -0.5;
    if (n > 0.2) return 0.2;
    return Math.round(n * 100) / 100;
  }
  const dims: DimensionFoundationScore[] = (['value', 'authority', 'point_of_view', 'connection'] as const).map(
    (id) => {
      const found = (parsed.dimensions ?? []).find((d: any) => d.id === id) ?? {};
      const adj = found.adjustments ?? found.deductions ?? {};
      // Treat legacy deduction keys as negative adjustments so an older cache
      // shape doesn't crash; the new path uses the signed "adjustments" key.
      const adjustments = {
        clarity: clampAdjustment(adj.clarity),
        depth: clampAdjustment(adj.depth),
        distinctness: clampAdjustment(adj.distinctness),
        transformation_alignment: clampAdjustment(adj.transformation_alignment),
        relevance: clampAdjustment(adj.relevance),
      };
      const total_adjustment =
        Math.round(
          (adjustments.clarity + adjustments.depth + adjustments.distinctness + adjustments.transformation_alignment + adjustments.relevance) * 100
        ) / 100;
      const baseline = baselines[id];
      const claudedFinal =
        typeof found.final_score === 'number' ? clampScore(found.final_score) : baseline + total_adjustment;
      const score = Math.max(0, Math.min(5, Math.round(claudedFinal * 10) / 10));
      return {
        id,
        label: LABELS[id],
        baseline,
        score,
        adjustments,
        total_adjustment,
        what_claude_noticed: safeStr(found.what_claude_noticed).slice(0, 500),
        what_to_strengthen: Array.isArray(found.what_to_strengthen)
          ? found.what_to_strengthen.slice(0, 5).map((s: any) => safeStr(s).slice(0, 200)).filter(Boolean)
          : [],
      };
    }
  );

  const result: FoundationScoresResult = {
    generated_at: Math.floor(Date.now() / 1000),
    model: 'claude-code',
    dimensions: dims,
    input_hash: inputHash,
  };

  saveCache(result);
  return result;
}

// ─── Cache I/O ────────────────────────────────────────────────────────────

function cachePath(): string {
  return abs(...CACHE_FILE_REL);
}

function saveCache(result: FoundationScoresResult): void {
  fs.writeFileSync(cachePath(), JSON.stringify(result, null, 2) + '\n', 'utf8');
}

export function loadCachedFoundationScores(): FoundationScoresResult | null {
  try {
    const raw = fs.readFileSync(cachePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.generated_at === 'number' &&
      Array.isArray(parsed?.dimensions) &&
      typeof parsed?.input_hash === 'string'
    ) {
      return parsed as FoundationScoresResult;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the cached scores were generated against the current
 * foundation content. False if no cache OR if the input has changed since
 * the cache was written.
 */
export function isCacheFresh(): boolean {
  const cached = loadCachedFoundationScores();
  if (!cached) return false;
  // Hash baseline-free content; the baseline is recomputed from the same
  // content, so it's fully determined by the hash.
  const { inputHash } = buildUserPrompt({ value: 0, authority: 0, point_of_view: 0, connection: 0 });
  return cached.input_hash === inputHash;
}

// Module-level singleton: prevents concurrent background scoring runs. If one
// is in flight, additional calls become a no-op until it resolves.
let scoringInFlight: Promise<void> | null = null;

/**
 * Trigger a background re-scoring when the cache is missing or stale. Returns
 * immediately - the caller never awaits the actual Claude call. The next page
 * load picks up the fresh cache.
 *
 * Safe to call on every page load: idempotent when cache is fresh, debounced
 * when a run is already in flight.
 */
export function ensureFoundationScoresFresh(): void {
  if (scoringInFlight) return;
  if (isCacheFresh()) return;
  scoringInFlight = (async () => {
    try {
      await runFoundationScoring();
    } catch (err) {
      console.error('background foundation scoring failed:', err);
    } finally {
      scoringInFlight = null;
    }
  })();
}
