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

import { BRIDGE_URL } from './bridge.js';

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

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function clean(s: string): string {
  return s.replace(/—/g, '-').replace(/–/g, '-').trim();
}

// ─── Avatars ───────────────────────────────────────────────────────────────

const AVATAR_EXTRACT_PROMPT = `You are extracting an audience avatar (persona) from the creator's prose vault files. The avatar is a real or composite person their offers serve.

Return ONLY valid JSON in this shape:
{
  "avatars": [
    {
      "name": "first name only, lowercase, e.g. 'the-avatar'",
      "title": "display title, e.g. 'Avatar - the avatar'",
      "one_line": "one sentence describing who she is + what she's trying to do",
      "who_she_is": "2-4 sentences: background, current state, the human details (age, location, work, family if mentioned)",
      "trying_to_do": "1-2 sentences: what she wants to achieve",
      "before_state": "1-2 sentences: where she is now / what's frustrating her",
      "after_state": "1-2 sentences: where she wants to be",
      "limiting_mindsets": ["3-5 short bullets in her voice"],
      "desire_language": ["3-5 short quotes/phrases of what she says she wants"],
      "problem_language": ["3-5 short quotes/phrases of what's wrong"]
    }
  ]
}

Rules:
- Usually one avatar. Two only if the source explicitly names two distinct personas.
- Use the creator's own words and phrasings where possible. Preserve specifics (names, numbers, places).
- No em dashes. Use hyphens.
- If a field isn't in the source, return an empty string or empty array - never invent.`;

export type ExtractedAvatar = {
  name: string;
  title: string;
  one_line: string;
  who_she_is: string;
  trying_to_do: string;
  before_state: string;
  after_state: string;
  limiting_mindsets: string[];
  desire_language: string[];
  problem_language: string[];
};

export async function extractAvatarsFromCore(): Promise<ExtractedAvatar[]> {
  const audience = readCore('core_audience.md');
  const positioning = readCore('core_positioning.md');
  if (!audience.trim()) return [];

  const user = `# core_audience.md\n${audience}\n\n# core_positioning.md\n${positioning.slice(0, 2000)}\n\nExtract the JSON now.`;
  const raw = await callBridge(AVATAR_EXTRACT_PROMPT, user);
  const parsed = parseJson(raw);
  const items = Array.isArray(parsed.avatars) ? parsed.avatars : [];
  return items
    .filter((a: any) => a && typeof a.name === 'string' && a.name.trim().length > 0)
    .map((a: any) => ({
      name: slugify(a.name),
      title: clean(a.title || `Avatar - ${a.name}`),
      one_line: clean(a.one_line || ''),
      who_she_is: clean(a.who_she_is || ''),
      trying_to_do: clean(a.trying_to_do || ''),
      before_state: clean(a.before_state || ''),
      after_state: clean(a.after_state || ''),
      limiting_mindsets: Array.isArray(a.limiting_mindsets) ? a.limiting_mindsets.map(clean) : [],
      desire_language: Array.isArray(a.desire_language) ? a.desire_language.map(clean) : [],
      problem_language: Array.isArray(a.problem_language) ? a.problem_language.map(clean) : [],
    }));
}

export function writeAvatarFiles(avatars: ExtractedAvatar[]): { added: number; skipped: number } {
  const dir = abs('05_Assets', 'Avatars');
  fs.mkdirSync(dir, { recursive: true });
  let added = 0;
  let skipped = 0;
  for (const a of avatars) {
    const filename = `avatar-${a.name}.md`;
    const filePath = `${dir}/${filename}`;
    if (fs.existsSync(filePath)) {
      skipped++;
      continue;
    }
    const fm = [
      '---',
      'type: core',
      `slug: avatar-${a.name}`,
      'status: active',
      'tags:',
      '  - type/core',
      '  - domain/audience',
      `aliases:`,
      `  - ${a.title}`,
      '---',
      '',
    ].join('\n');
    const body = [
      `# ${a.title}`,
      '',
      a.one_line,
      '',
      '## Who She Is',
      '',
      a.who_she_is,
      '',
      '## What She Is Trying to Do',
      '',
      a.trying_to_do,
      '',
      '## Before State',
      '',
      a.before_state,
      '',
      '## After State',
      '',
      a.after_state,
      '',
      '## Limiting Mindsets',
      '',
      a.limiting_mindsets.map((m) => `- ${m}`).join('\n'),
      '',
      '## Desire Language',
      '',
      a.desire_language.map((d) => `- "${d}"`).join('\n'),
      '',
      '## Problem Language',
      '',
      a.problem_language.map((p) => `- "${p}"`).join('\n'),
      '',
    ].join('\n');
    fs.writeFileSync(filePath, fm + body, 'utf8');
    added++;
  }
  return { added, skipped };
}

// ─── POV files ─────────────────────────────────────────────────────────────

const POV_EXTRACT_PROMPT = `You are extracting individual POVs (contrarian beliefs) from the creator's IP and positioning files. Each POV is a stance they hold that's different from the conventional wisdom in their space.

Return ONLY valid JSON in this shape:
{
  "povs": [
    {
      "title": "short title (3-6 words)",
      "pov": "one or two sentences stating the contrarian position. Often phrased as 'not X, but Y'.",
      "idea_behind_it": "1-3 sentences of context - what makes this a POV vs a common opinion",
      "why_believe_it": "1-3 sentences of reasoning or evidence",
      "topics": ["1-3 topic tags from: positioning, offer-creation, content, audience, launch, scaling, mindset, voice"]
    }
  ]
}

Rules:
- 3-8 POVs. Quality over quantity.
- Each POV must be genuinely contrarian or at minimum non-obvious. Skip platitudes.
- Use the creator's voice and phrasing where it appears in the source.
- No em dashes. Use hyphens.`;

export type ExtractedPov = {
  title: string;
  pov: string;
  idea_behind_it: string;
  why_believe_it: string;
  topics: string[];
};

export async function extractPovsFromCore(): Promise<ExtractedPov[]> {
  const ip = readCore('core_ip.md');
  const positioning = readCore('core_positioning.md');
  if (!ip.trim() && !positioning.trim()) return [];

  const user = `# core_ip.md\n${ip}\n\n# core_positioning.md\n${positioning}\n\nExtract the JSON now.`;
  const raw = await callBridge(POV_EXTRACT_PROMPT, user);
  const parsed = parseJson(raw);
  const items = Array.isArray(parsed.povs) ? parsed.povs : [];
  return items
    .filter((p: any) => p && typeof p.title === 'string' && p.pov)
    .map((p: any) => ({
      title: clean(p.title),
      pov: clean(p.pov),
      idea_behind_it: clean(p.idea_behind_it || ''),
      why_believe_it: clean(p.why_believe_it || ''),
      topics: Array.isArray(p.topics) ? p.topics.filter((t: any) => typeof t === 'string') : [],
    }));
}

export function writePovFiles(povs: ExtractedPov[]): { added: number; skipped: number } {
  const dir = abs('05_Assets', 'POVs');
  fs.mkdirSync(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  let skipped = 0;
  for (const p of povs) {
    const slug = slugify(p.title);
    const filename = `asset_pov-${slug}.md`;
    const filePath = `${dir}/${filename}`;
    if (fs.existsSync(filePath)) {
      skipped++;
      continue;
    }
    const fm = [
      '---',
      'type: pov',
      `slug: pov-${slug}`,
      'status: draft',
      'tags:',
      '  - type/asset',
      ...p.topics.map((t) => `  - topic/${t}`),
      'aliases:',
      `  - "POV: ${p.title}"`,
      `id: pov-${slug}`,
      `title: ${p.title.toLowerCase()}`,
      `created: '${today}'`,
      `updated: '${today}'`,
      'topics:',
      ...p.topics.map((t) => `  - ${t}`),
      '---',
      '',
    ].join('\n');
    const body = [
      '## POV',
      '',
      p.pov,
      '',
      '## The Idea Behind It',
      '',
      p.idea_behind_it,
      '',
      '## Why I Believe This',
      '',
      p.why_believe_it,
      '',
      "## How I'd Use This In A Video",
      '',
      '[to be developed]',
      '',
    ].join('\n');
    fs.writeFileSync(filePath, fm + body, 'utf8');
    added++;
  }
  return { added, skipped };
}

// ─── Offer rungs ───────────────────────────────────────────────────────────

const OFFER_RUNG_PROMPT = `You are extracting an offer ladder (low/mid/high tier offers) from the creator's offer suite file.

Return ONLY valid JSON in this shape:
{
  "rungs": [
    {
      "tier": "low" | "mid" | "high",
      "name": "offer name",
      "price_label": "e.g. '$47/month' or '$10k+' or 'free'",
      "promise": "one-sentence outcome statement - what the customer gets",
      "proof_required": "what proof or asset the offer needs (e.g. 'Skool community', 'case studies', 'sales page')"
    }
  ]
}

Rules:
- One rung per tier they describe. Could be 1, 2, or 3 rungs.
- "tier": "low" = $0-99/month or one-time under $200. "mid" = $200-999/month or one-time $200-2000. "high" = $1000+/month or $2000+ one-time.
- Use names + prices as written in the source. Don't invent prices.
- promise must be a specific outcome statement. Skip vague ones.
- No em dashes. Use hyphens.`;

export type ExtractedRung = {
  tier: 'low' | 'mid' | 'high';
  name: string;
  price_label: string;
  promise: string;
  proof_required: string;
};

export async function extractOfferRungsFromCore(): Promise<ExtractedRung[]> {
  const offer = readCore('core_offer-suite.md');
  const positioning = readCore('core_positioning.md');
  if (!offer.trim()) return [];

  const user = `# core_offer-suite.md\n${offer}\n\n# core_positioning.md\n${positioning.slice(0, 1500)}\n\nExtract the JSON now.`;
  const raw = await callBridge(OFFER_RUNG_PROMPT, user);
  const parsed = parseJson(raw);
  const items = Array.isArray(parsed.rungs) ? parsed.rungs : [];
  return items
    .filter(
      (r: any) =>
        r && typeof r.name === 'string' && ['low', 'mid', 'high'].includes(r.tier)
    )
    .map((r: any) => ({
      tier: r.tier as 'low' | 'mid' | 'high',
      name: clean(r.name),
      price_label: clean(r.price_label || ''),
      promise: clean(r.promise || ''),
      proof_required: clean(r.proof_required || ''),
    }));
}

export function writeOfferRungs(rungs: ExtractedRung[]): { added: number; skipped: number } {
  const filePath = abs('00_System', 'offer-pricing-rungs.json');
  let existing: any[] = [];
  try {
    existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {}
  const existingTiers = new Set(existing.map((r) => r.tier));
  const nowSec = Math.floor(Date.now() / 1000);
  let added = 0;
  let skipped = 0;
  const additions: any[] = [];
  for (const r of rungs) {
    if (existingTiers.has(r.tier)) {
      skipped++;
      continue;
    }
    additions.push({
      id: uuid(),
      tier: r.tier,
      name: r.name,
      price_label: r.price_label,
      promise: r.promise,
      proof_required: r.proof_required,
      status: 'iterating',
      sort_order: r.tier === 'low' ? 1 : r.tier === 'mid' ? 2 : 3,
      featured: r.tier === 'mid', // mid tier featured by default
      created_at: nowSec,
      updated_at: nowSec,
    });
    added++;
  }
  if (additions.length > 0) {
    const next = [...additions, ...existing];
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
  }
  return { added, skipped };
}

// ─── Journey timeline entries ──────────────────────────────────────────────

const JOURNEY_EXTRACT_PROMPT = `You are extracting journey timeline entries from the creator's origin story. Each entry is a single moment, dated YYYY-MM, tagged as win/failure/lesson/avatar.

Return ONLY valid JSON in this shape:
{
  "entries": [
    {
      "date": "YYYY-MM",
      "type": "win" | "failure" | "lesson" | "avatar",
      "title": "short title (max 12 words)",
      "body": "1-3 sentences of context. Use the creator's voice."
    }
  ]
}

Rules:
- Type meanings: "win" = a result/milestone. "failure" = something that didn't work. "lesson" = a realization/turning point. "avatar" = a moment that represents who they were at that time.
- 6-15 entries spread across the years their story covers.
- date must be YYYY-MM. If only a year is mentioned, use a reasonable month (e.g. mid-year = 06).
- titles in lowercase, conversational.
- No em dashes. Use hyphens.`;

export type ExtractedJourneyEntry = {
  date: string;
  type: 'win' | 'failure' | 'lesson' | 'avatar';
  title: string;
  body: string;
};

export async function extractJourneyFromCore(): Promise<ExtractedJourneyEntry[]> {
  const story = readCore('core_my-story.md');
  const positioning = readCore('core_positioning.md');
  if (!story.trim()) return [];

  const user = `# core_my-story.md\n${story}\n\n# core_positioning.md\n${positioning.slice(0, 1500)}\n\nExtract the JSON now.`;
  const raw = await callBridge(JOURNEY_EXTRACT_PROMPT, user);
  const parsed = parseJson(raw);
  const items = Array.isArray(parsed.entries) ? parsed.entries : [];
  return items
    .filter(
      (e: any) =>
        e &&
        typeof e.title === 'string' &&
        typeof e.date === 'string' &&
        /^\d{4}-\d{2}$/.test(e.date) &&
        ['win', 'failure', 'lesson', 'avatar'].includes(e.type)
    )
    .map((e: any) => ({
      date: e.date,
      type: e.type as 'win' | 'failure' | 'lesson' | 'avatar',
      title: clean(e.title),
      body: clean(e.body || ''),
    }));
}

export function writeJourneyEntries(entries: ExtractedJourneyEntry[]): { added: number; skipped: number } {
  const filePath = abs('00_System', 'journey-timeline.json');
  let existing: { entries: any[]; start_date?: string } = { entries: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(raw)) existing = { entries: raw };
    else existing = { entries: Array.isArray(raw?.entries) ? raw.entries : [], start_date: raw?.start_date };
  } catch {}
  const existingKey = new Set(existing.entries.map((e: any) => `${e.date}::${e.title}`));
  const nowSec = Math.floor(Date.now() / 1000);
  let added = 0;
  let skipped = 0;
  const additions: any[] = [];
  for (const e of entries) {
    const key = `${e.date}::${e.title}`;
    if (existingKey.has(key)) {
      skipped++;
      continue;
    }
    additions.push({
      id: Math.random().toString(36).slice(2, 14),
      date: e.date,
      type: e.type,
      title: e.title,
      body: e.body,
      tags: [],
      created_at: nowSec,
      updated_at: nowSec,
    });
    added++;
  }
  if (additions.length > 0) {
    const next = { ...existing, entries: [...existing.entries, ...additions] };
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
  }
  return { added, skipped };
}

// ─── Batched extraction (token-efficient) ───────────────────────────────────
//
// One call covers all 6 extractor types. The 6 core files are sent ONCE
// instead of 6 times (or 4 times across the separate slot/avatar/POV/rung/
// journey/wins extractors), so input tokens drop ~70% for the full first-run
// extraction pass. Output token cost is similar to the sum of the 6 separate
// calls. Wall clock is faster too because the model processes the file set
// once and emits all outputs in a single generation.
//
// Quality trade-off: a single combined prompt is more crowded than 6 focused
// ones. Mitigated by giving each section its own labelled JSON sub-key with
// the same field rules the focused prompts use, so the model still gets
// clear per-section guidance.

const BATCH_EXTRACT_PROMPT = `You are extracting structured foundation data from a creator's 6 core vault files. You will return ONE JSON object with six keys: slots, avatars, povs, rungs, journey, wins. Each section has its own rules. Be precise and use the creator's own phrasings where they appear in the source.

Return ONLY valid JSON in this shape:

{
  "slots": {
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
  },
  "avatars": [
    {
      "name": "first name only, lowercase",
      "title": "display title, e.g. 'Avatar - Adriana'",
      "one_line": "one sentence describing who she is + what she's trying to do",
      "who_she_is": "2-4 sentences: background, current state, the human details (age, location, work, family if mentioned)",
      "trying_to_do": "1-2 sentences: what she wants to achieve",
      "before_state": "1-2 sentences: where she is now / what's frustrating her",
      "after_state": "1-2 sentences: where she wants to be",
      "limiting_mindsets": ["3-5 short bullets in her voice"],
      "desire_language": ["3-5 short quotes/phrases of what she says she wants"],
      "problem_language": ["3-5 short quotes/phrases of what's wrong"]
    }
  ],
  "povs": [
    {
      "title": "short title (3-6 words)",
      "pov": "one or two sentences stating the contrarian position. Often phrased as 'not X, but Y'.",
      "idea_behind_it": "1-3 sentences of context - what makes this a POV vs a common opinion",
      "why_believe_it": "1-3 sentences of reasoning or evidence",
      "topics": ["1-3 topic tags from: positioning, offer-creation, content, audience, launch, scaling, mindset, voice"]
    }
  ],
  "rungs": [
    {
      "tier": "low" | "mid" | "high",
      "name": "offer name",
      "price_label": "e.g. '$47/month' or '$10k+' or 'free'",
      "promise": "one-sentence outcome statement - what the customer gets",
      "proof_required": "what proof or asset the offer needs"
    }
  ],
  "journey": [
    {
      "date": "YYYY-MM",
      "type": "win" | "failure" | "lesson" | "avatar",
      "title": "short title (max 12 words)",
      "body": "1-3 sentences of context. Use the creator's voice."
    }
  ],
  "wins": [
    {
      "title": "short specific result (max 12 words, includes numbers + timeline)",
      "body": "1 sentence context",
      "kind": "own" | "client",
      "metric": "the specific number or proof point"
    }
  ]
}

Slot rules:
- Each slot value is one short sentence (max 25 words).
- If a slot is not clearly stated in the source, return null for that key.
- pov_1_flip through pov_3_flip should be contrarian flips ("not X, but Y" stances).
- compressed_story is the 30-second version of the founder's story.
- value_method is the name of the named system.
- value_step_1 through 5 are the 5 named steps of the method.

Avatar rules:
- Usually one avatar. Two only if the source explicitly names two distinct personas.
- Preserve specifics (names, numbers, places). Empty string or empty array if a field is not in the source - never invent.

POV rules:
- 3-8 POVs. Quality over quantity. Each POV must be genuinely contrarian or non-obvious.

Rung rules:
- One rung per tier the source describes. Could be 1, 2, or 3 rungs total.
- "low" = $0-99/month or one-time under $200. "mid" = $200-999/month or one-time $200-2000. "high" = $1000+/month or $2000+ one-time.
- Use names + prices as written in the source. Don't invent prices.

Journey rules:
- 6-15 entries spread across the years the story covers.
- date must be YYYY-MM. If only a year is mentioned, use a reasonable month.
- "win" = a result/milestone. "failure" = something that did not work. "lesson" = a realization. "avatar" = a moment representing who they were at that time.

Wins rules:
- ONLY genuinely specific results. Skip anything vague.
- Each "title" must have a number, dollar amount, percentage, or named timeframe.
- 5-15 wins maximum.

Universal rules:
- No em dashes. Use hyphens.
- Empty arrays / null fields are valid when the source does not contain the data.`;

export type BatchedExtraction = {
  slots: Record<string, string | null>;
  avatars: ExtractedAvatar[];
  povs: ExtractedPov[];
  rungs: ExtractedRung[];
  journey: ExtractedJourneyEntry[];
  wins: Array<{ title: string; body?: string; kind: 'own' | 'client'; metric?: string }>;
};

export async function extractAllFromCore(): Promise<BatchedExtraction> {
  // Single canonical payload. Send all 6 files in fixed order so the cache
  // key (system + user prefix) is identical across runs - means hot reloads
  // and re-extractions within the 5-minute Anthropic cache window hit cache.
  const corePayload = [
    `# core_positioning.md\n${readCore('core_positioning.md')}`,
    `# core_audience.md\n${readCore('core_audience.md')}`,
    `# core_my-story.md\n${readCore('core_my-story.md')}`,
    `# core_ip.md\n${readCore('core_ip.md')}`,
    `# core_offer-suite.md\n${readCore('core_offer-suite.md')}`,
    `# core_voice-style.md\n${readCore('core_voice-style.md')}`,
  ].join('\n\n');

  const user = `${corePayload}\n\nExtract the JSON now. Return the full object with all six keys (slots, avatars, povs, rungs, journey, wins). Each section follows its own rules above.`;

  const raw = await callBridge(BATCH_EXTRACT_PROMPT, user);
  const parsed = parseJson(raw);

  // Slot normalisation (same logic as extractBrandSlots)
  const slots: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(parsed.slots ?? {})) {
    slots[k] = typeof v === 'string' && v.trim().length > 0 ? clean(v) : null;
  }

  // Avatars
  const avatars: ExtractedAvatar[] = Array.isArray(parsed.avatars)
    ? parsed.avatars
        .filter((a: any) => a && typeof a.name === 'string' && a.name.trim().length > 0)
        .map((a: any) => ({
          name: slugify(a.name),
          title: clean(a.title || `Avatar - ${a.name}`),
          one_line: clean(a.one_line || ''),
          who_she_is: clean(a.who_she_is || ''),
          trying_to_do: clean(a.trying_to_do || ''),
          before_state: clean(a.before_state || ''),
          after_state: clean(a.after_state || ''),
          limiting_mindsets: Array.isArray(a.limiting_mindsets) ? a.limiting_mindsets.map(clean) : [],
          desire_language: Array.isArray(a.desire_language) ? a.desire_language.map(clean) : [],
          problem_language: Array.isArray(a.problem_language) ? a.problem_language.map(clean) : [],
        }))
    : [];

  // POVs
  const povs: ExtractedPov[] = Array.isArray(parsed.povs)
    ? parsed.povs
        .filter((p: any) => p && typeof p.title === 'string' && p.pov)
        .map((p: any) => ({
          title: clean(p.title),
          pov: clean(p.pov),
          idea_behind_it: clean(p.idea_behind_it || ''),
          why_believe_it: clean(p.why_believe_it || ''),
          topics: Array.isArray(p.topics) ? p.topics.filter((t: any) => typeof t === 'string') : [],
        }))
    : [];

  // Rungs
  const rungs: ExtractedRung[] = Array.isArray(parsed.rungs)
    ? parsed.rungs
        .filter(
          (r: any) =>
            r && typeof r.name === 'string' && ['low', 'mid', 'high'].includes(r.tier)
        )
        .map((r: any) => ({
          tier: r.tier as 'low' | 'mid' | 'high',
          name: clean(r.name),
          price_label: clean(r.price_label || ''),
          promise: clean(r.promise || ''),
          proof_required: clean(r.proof_required || ''),
        }))
    : [];

  // Journey
  const journey: ExtractedJourneyEntry[] = Array.isArray(parsed.journey)
    ? parsed.journey
        .filter(
          (e: any) =>
            e &&
            typeof e.title === 'string' &&
            typeof e.date === 'string' &&
            /^\d{4}-\d{2}$/.test(e.date) &&
            ['win', 'failure', 'lesson', 'avatar'].includes(e.type)
        )
        .map((e: any) => ({
          date: e.date,
          type: e.type as 'win' | 'failure' | 'lesson' | 'avatar',
          title: clean(e.title),
          body: clean(e.body || ''),
        }))
    : [];

  // Wins
  const wins = Array.isArray(parsed.wins)
    ? parsed.wins
        .filter((w: any) => w && typeof w.title === 'string' && w.title.trim().length > 0)
        .map((w: any) => ({
          title: clean(w.title),
          body: typeof w.body === 'string' ? clean(w.body) : undefined,
          kind: w.kind === 'client' ? 'client' : 'own' as 'own' | 'client',
          metric: typeof w.metric === 'string' ? clean(w.metric) : undefined,
        }))
    : [];

  return { slots, avatars, povs, rungs, journey, wins };
}
