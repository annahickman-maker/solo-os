/**
 * Auto-populate brand profile slots, wins bank, and micro-stories from
 * the creator's existing core files. Calls Claude via the bridge to extract
 * structured values from prose.
 *
 * Called by /api/seed/from-core (POST). Idempotent in the sense that it
 * writes to state.md / wins.json / micro-stories.json with merged values
 * — anything already present in those files is preserved.
 */

import fs from 'node:fs';
import { abs, loadCollection, loadFile, saveFile } from '../vault.js';

const BRIDGE_URL = 'http://localhost:8788/run';

function readCore(filename: string): string {
  try {
    const raw = fs.readFileSync(abs('01_Core', filename), 'utf8');
    return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  } catch {
    return '';
  }
}

async function callBridge(system: string, user: string): Promise<string> {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'extractFromCore', system, user, maxTokens: 3000, expectJson: true }),
  });
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { text?: string; error?: string };
  if (data.error) throw new Error(data.error);
  if (!data.text) throw new Error('bridge: no text');
  return data.text;
}

function parseJson(raw: string): any {
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('could not parse json');
    return JSON.parse(m[0]);
  }
}

// ─── Brand profile slots ───────────────────────────────────────────────────

const SLOT_EXTRACT_PROMPT = `You are extracting structured brand profile values from a creator's prose vault files. Return ONLY valid JSON in this shape:

{
  "positioning_statement": "...",
  "who_you_help": "...",
  "before_state": "...",
  "after_state": "...",
  "transformation_result": "...",
  "value_method": "name of the method/system",
  "value_step_1": "...", "value_step_2": "...", "value_step_3": "...", "value_step_4": "...", "value_step_5": "...",
  "common_enemy": "...",
  "core_named_mechanism": "...",
  "pov_1_flip": "...", "pov_2_flip": "...", "pov_3_flip": "...",
  "compressed_story": "...",
  "transformation_statement": "..."
}

Rules:
- Each value is one short sentence (max 25 words).
- No em dashes. Use hyphens.
- If a value isn't clearly stated in the source, return null for that key.
- pov_1_flip through pov_3_flip should be contrarian flips ("not X, but Y" stances).
- compressed_story is the 30-second version of the founder's story.
- value_method is the name of the named system (e.g., "Solopreneur OS").
- value_step_1 through 5 are the 5 named steps of the method.`;

export async function extractBrandSlots(): Promise<Record<string, string | null>> {
  const positioning = readCore('core_positioning.md');
  const ip = readCore('core_ip.md');
  const story = readCore('core_my-story.md');
  const audience = readCore('core_audience.md');

  const user = `# core_positioning.md\n${positioning}\n\n# core_ip.md\n${ip}\n\n# core_my-story.md\n${story.slice(0, 4000)}\n\n# core_audience.md\n${audience.slice(0, 3000)}\n\nExtract the JSON now.`;
  const raw = await callBridge(SLOT_EXTRACT_PROMPT, user);
  const parsed = parseJson(raw);
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(parsed)) {
    out[k] = typeof v === 'string' && v.trim().length > 0 ? v.trim().replace(/—/g, '-').replace(/–/g, '-') : null;
  }
  return out;
}

// Write extracted slots to state.md frontmatter (under slot_<name> keys).
// Preserves any existing slot_* values - only fills in ones currently missing.
export function writeBrandSlotsToState(slots: Record<string, string | null>): { written: number; skipped: number } {
  const filePath = abs('00_System', 'state.md');
  const existing = loadFile(filePath);
  const fm = { ...(existing?.frontmatter ?? {}) } as Record<string, unknown>;
  let written = 0;
  let skipped = 0;
  for (const [key, value] of Object.entries(slots)) {
    if (!value) continue;
    const k = `slot_${key}`;
    if (typeof fm[k] === 'string' && (fm[k] as string).trim().length > 0) {
      skipped++;
      continue;
    }
    fm[k] = value;
    written++;
  }
  fm.updated = new Date().toISOString();
  saveFile(
    filePath,
    fm,
    existing?.body ?? '# Dashboard State\n\nAggregate metrics for the dashboard.\n'
  );
  return { written, skipped };
}

// ─── Wins bank ─────────────────────────────────────────────────────────────

const WINS_EXTRACT_PROMPT = `You are extracting concrete wins/results from a creator's prose vault files. Return ONLY valid JSON in this shape:

{
  "wins": [
    {
      "title": "short specific result (max 12 words, includes numbers + timeline)",
      "body": "1 sentence context about the win",
      "kind": "own" | "client",
      "metric": "the specific number or proof point"
    }
  ]
}

Rules:
- ONLY extract genuinely specific results. Skip anything vague.
- Each "title" must have a number, dollar amount, percentage, or named timeframe.
- 5-15 wins maximum. Quality over quantity.
- "kind": "own" if it's the creator's personal result, "client" if it's a client outcome.
- No em dashes. Use hyphens.`;

export async function extractWins(): Promise<Array<{ title: string; body?: string; kind: 'own' | 'client'; metric?: string }>> {
  const story = readCore('core_my-story.md');
  const positioning = readCore('core_positioning.md');
  const offerSuite = readCore('core_offer-suite.md');
  // Also scan known proof files
  let proof = '';
  try {
    proof = fs.readFileSync(abs('05_Assets', 'Proof', 'asset_proof.md'), 'utf8');
  } catch {}

  const user = `# core_my-story.md\n${story}\n\n# core_positioning.md\n${positioning}\n\n# core_offer-suite.md\n${offerSuite}\n\n# asset_proof.md\n${proof}\n\nExtract the JSON now.`;
  const raw = await callBridge(WINS_EXTRACT_PROMPT, user);
  const parsed = parseJson(raw);
  const items = Array.isArray(parsed.wins) ? parsed.wins : [];
  return items
    .filter((w: any) => w && typeof w.title === 'string' && w.title.trim().length > 0)
    .map((w: any) => ({
      title: w.title.trim().replace(/—/g, '-').replace(/–/g, '-'),
      body: typeof w.body === 'string' ? w.body.trim().replace(/—/g, '-').replace(/–/g, '-') : undefined,
      kind: w.kind === 'client' ? 'client' : 'own',
      metric: typeof w.metric === 'string' ? w.metric.trim() : undefined,
    }));
}

// ─── Micro-stories bank ────────────────────────────────────────────────────

const STORIES_EXTRACT_PROMPT = `You are extracting micro-stories from a creator's prose origin story. Return ONLY valid JSON in this shape:

{
  "stories": [
    {
      "text": "the micro-story in 1-3 sentences, written in first person from the creator's POV",
      "source_episode": "which life moment this is from (e.g., 'leaving agency job', 'first client win', 'almost quit moment')"
    }
  ]
}

Rules:
- A micro-story is a small, specific, vivid moment. Not a summary, not a teaching.
- 8-15 stories. Quality over quantity.
- Each story must be something the creator could tell verbally in 30 seconds.
- First person ("I" not "she"). Past tense. Specific details (a place, a time, a feeling).
- No em dashes. Use hyphens.`;

export async function extractMicroStories(): Promise<Array<{ text: string; source_episode?: string }>> {
  const story = readCore('core_my-story.md');
  const positioning = readCore('core_positioning.md');

  const user = `# core_my-story.md\n${story}\n\n# core_positioning.md\n${positioning}\n\nExtract the JSON now.`;
  const raw = await callBridge(STORIES_EXTRACT_PROMPT, user);
  const parsed = parseJson(raw);
  const items = Array.isArray(parsed.stories) ? parsed.stories : [];
  return items
    .filter((s: any) => s && typeof s.text === 'string' && s.text.trim().length > 20)
    .map((s: any) => ({
      text: s.text.trim().replace(/—/g, '-').replace(/–/g, '-'),
      source_episode: typeof s.source_episode === 'string' ? s.source_episode.trim() : undefined,
    }));
}

// ─── Verbatim micro-stories from video transcripts ─────────────────────────
// The paraphrased version (extractMicroStories) is removed in favour of this.
// Pulls exact quotes from published video transcripts so each micro-story is
// something the creator actually said on camera, with attribution.

const VERBATIM_STORIES_PROMPT = `You are reading published YouTube video transcripts. Extract VERBATIM micro-stories - small, specific, vivid moments the creator tells in her own voice.

A micro-story is:
- A specific moment (a date, a place, a feeling, a concrete event)
- 1-4 sentences pulled directly from the transcript
- Anecdotal (the creator describing a thing that happened to her)
- NOT a lesson, NOT a tip, NOT a hypothetical, NOT advice

Return ONLY valid JSON:
{
  "stories": [
    {
      "text": "the EXACT WORDS from the transcript - do NOT paraphrase, do NOT clean up, do NOT polish",
      "video_title": "the title heading shown above the transcript section",
      "video_id": "the videoId from the transcript section heading"
    }
  ]
}

HARD RULES:
- text must be a verbatim quote. Reproduce her exact words. Do not insert filler punctuation she didn't use, do not fix grammar, do not add quotation marks she didn't use.
- Skip pure teaching moments, hooks, sales pitches, tutorial walk-throughs.
- Skip rhetorical openers ("imagine you are...", "what if you...").
- Each story must reference a specific moment with concrete details (date / place / feeling / outcome).
- 10-25 stories total. Skip a video if it has no genuine personal story moments.
- No em dashes. Use hyphens.`;

function loadAllTranscriptsForExtraction(): string {
  const entries = loadCollection('04_Channel/04_Projects', { type: 'video' });
  const out: string[] = [];
  for (const e of entries) {
    const fm = e.frontmatter as any;
    if (fm?.status !== 'published') continue;
    if (fm?.archived) continue;
    if (!fm?.youtube_id) continue;
    const transcriptMatch = e.body.match(/##\s+Transcript\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
    if (!transcriptMatch) continue;
    const transcript = transcriptMatch[1]!.trim();
    if (transcript.length < 500) continue;
    out.push(`### [${fm.youtube_id}] "${fm.title}"\n${transcript.slice(0, 6000)}`);
  }
  return out.join('\n\n');
}

export async function extractVerbatimMicroStories(): Promise<
  Array<{ text: string; video_title?: string; video_id?: string }>
> {
  const transcripts = loadAllTranscriptsForExtraction();
  if (!transcripts) return [];
  const user = `# PUBLISHED VIDEO TRANSCRIPTS\n\n${transcripts}\n\nExtract verbatim micro-stories now. Return the JSON object.`;
  const raw = await callBridge(VERBATIM_STORIES_PROMPT, user);
  const parsed = parseJson(raw);
  const items = Array.isArray(parsed.stories) ? parsed.stories : [];
  return items
    .filter((s: any) => s && typeof s.text === 'string' && s.text.trim().length > 30)
    .map((s: any) => ({
      text: s.text.trim().replace(/—/g, '-').replace(/–/g, '-'),
      video_title: typeof s.video_title === 'string' ? s.video_title.trim() : undefined,
      video_id: typeof s.video_id === 'string' ? s.video_id.trim() : undefined,
    }));
}

// Write to bank JSON files. Each item gets a UUID + timestamps + 'candidate' status.
export function appendToBank(name: 'wins' | 'micro-stories', items: any[]): { added: number } {
  const filePath = abs('00_System', `${name}.json`);
  let existing: any[] = [];
  try {
    existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {}
  const nowSec = Math.floor(Date.now() / 1000);
  const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
  const additions = items.map((it: any) => ({
    id: uuid(),
    ...it,
    status: name === 'wins' ? 'pending' : 'candidate',
    created_at: nowSec,
    updated_at: nowSec,
  }));
  const next = [...additions, ...existing];
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
  return { added: additions.length };
}
