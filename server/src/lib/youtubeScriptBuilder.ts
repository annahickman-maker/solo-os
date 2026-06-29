/**
 * YouTube script builder.
 *
 * Workflow 1 (idea-first): user has a video title + transformation, Claude
 * suggests which bank items would make the strongest backbone, user edits,
 * Claude weaves them into a draft script.
 *
 * Workflow 2 (transcript-first, future): user picks a bank item as the seed
 * for a new video; that same draft flow runs but the seed is pre-selected.
 *
 * The synthesis is the same DNA as the IG story synthesizer: use ONLY the
 * provided bank items, verbatim where possible, light cleanup of fillers,
 * no new claims, no generic YouTube voice. the creator's own words, arranged.
 */

import fs from 'node:fs';
import { abs, loadCollection } from '../vault.js';

import { BRIDGE_URL } from './bridge.js';
import { personalize } from './creatorContext.js';

export type BankKind = 'pov' | 'framework' | 'story' | 'proof';
export type StructureMode = 'infer' | 'fixed' | 'hybrid';

export type BankItem = {
  id: string;            // composite: `<kind>:<original-id>`
  kind: BankKind;
  text: string;
  title?: string | null;
  context?: string | null;
  source_transcript?: string | null;
  source_timestamp?: string | null;
  source_moments?: Array<{ text: string; timestamp: string }>;
  // User-applied topic chips for filtering when picking anchors.
  topics?: string[];
};

// ─── Bank loaders ─────────────────────────────────────────────────────────

function loadBankJson<T>(name: string): T[] {
  try {
    const raw = fs.readFileSync(abs('00_System', `${name}.json`), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function loadAllBanks(): BankItem[] {
  const items: BankItem[] = [];

  // POVs (file-per-row at 05_Assets/POVs/asset_pov-*.md)
  for (const e of loadCollection('05_Assets/POVs', { type: 'pov' })) {
    const fm = e.frontmatter as any;
    const povSection = e.body.match(/##\s+POV\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
    const ctxSection = e.body.match(/##\s+Context\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
    const text = povSection ? povSection[1]!.trim() : e.body.trim();
    items.push({
      id: `pov:${fm.id ?? e.id}`,
      kind: 'pov',
      text,
      title: fm.title ?? null,
      context: ctxSection ? ctxSection[1]!.trim() : null,
      source_transcript: fm.source_transcript ?? null,
      source_timestamp: fm.source_timestamp ?? null,
      topics: Array.isArray(fm.topics) ? fm.topics : (Array.isArray(fm.tags) ? fm.tags : []),
    });
  }

  // Teaching frameworks
  for (const f of loadBankJson<any>('teaching-frameworks')) {
    if (!f?.text) continue;
    items.push({
      id: `framework:${f.id}`,
      kind: 'framework',
      text: f.text,
      title: f.title ?? null,
      context: f.context ?? null,
      source_transcript: f.source_transcript ?? null,
      source_timestamp: f.source_timestamp ?? null,
      source_moments: Array.isArray(f.source_moments) ? f.source_moments : [],
      topics: Array.isArray(f.tags) ? f.tags : [],
    });
  }

  // Personal stories (verbatim micro-stories from transcripts)
  for (const s of loadBankJson<any>('micro-stories')) {
    if (!s?.text) continue;
    // Skip the legacy paraphrased entries (they have no source_transcript)
    if (!s.source_transcript && !s.source_episode && !s.title) continue;
    items.push({
      id: `story:${s.id}`,
      kind: 'story',
      text: s.text,
      title: s.title ?? null,
      context: s.context ?? null,
      source_transcript: s.source_transcript ?? null,
      source_timestamp: s.source_timestamp ?? null,
      source_moments: Array.isArray(s.source_moments) ? s.source_moments : [],
      topics: Array.isArray(s.tags) ? s.tags : [],
    });
  }

  // Proof / connection points
  for (const p of loadBankJson<any>('proof-points')) {
    if (!p?.text) continue;
    items.push({
      id: `proof:${p.id}`,
      kind: 'proof',
      text: p.text,
      title: p.title ?? null,
      context: p.context ?? null,
      source_transcript: p.source_transcript ?? null,
      source_timestamp: p.source_timestamp ?? null,
      source_moments: Array.isArray(p.source_moments) ? p.source_moments : [],
      topics: Array.isArray(p.tags) ? p.tags : [],
    });
  }

  // Note: core file sections (01_Core/core_*.md) are intentionally NOT loaded
  // here. They're written for sales pages and brand docs, not for speaking.
  // YouTube scripts should sound like the creator talking, not like the creator writing copy,
  // so the bank only surfaces transcript-sourced verbatim items.

  return items;
}


export function findBankItems(ids: string[]): BankItem[] {
  const all = loadAllBanks();
  const map = new Map(all.map((i) => [i.id, i]));
  return ids.map((id) => map.get(id)).filter((x): x is BankItem => !!x);
}

// ─── Claude bridge ────────────────────────────────────────────────────────

async function callBridge(system: string, user: string, maxTokens = 14000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7 * 60 * 1000);
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'youtubeScriptBuilder',
        system: personalize(system),
        user,
        maxTokens,
        expectJson: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`claude-bridge ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error) throw new Error(`claude-bridge: ${data.error}`);
    if (!data.text) throw new Error('claude-bridge: no text in response');
    return data.text;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('script generation timed out after 7 minutes. try again.');
    }
    // Networking-level failures usually mean the bridge process is down or
    // crashing. Surface a clear restart instruction instead of leaving the creator
    // staring at "fetch failed" which doesn't tell her what to do.
    const msg = String(err?.cause?.message || err?.message || err);
    if (/fetch failed|ECONNREFUSED|ECONNRESET|empty reply/i.test(msg)) {
      throw new Error(
        'claude-bridge is not responding. restart it: kill the existing one and run `cd 03_Projects/dashboard/claude-bridge && npm start`'
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(raw: string): any {
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('could not parse JSON from response');
    return JSON.parse(m[0]!);
  }
}

// ─── Suggest anchors ─────────────────────────────────────────────────────

const SUGGEST_SYSTEM = `You are the creator's content strategist. You have access to the creator's approved verbatim bank items - POVs, teaching frameworks, personal stories, proof/connection moments. Every one of these is something she actually said on a call, in a workshop, or in a past video. Her own words.

Your job: given a video title + transformation, pick 8-15 bank items that would make the strongest backbone for that script. A good YouTube video needs:
- 1-2 personal stories (open with story, possibly a second one as midroll connection)
- 1-2 POVs (the belief shift / mindset reframe the video is teaching)
- 2-4 teaching frameworks (the value the viewer gets)
- 1-2 proof / connection moments (sprinkled for credibility and "me too")

Pick items that are ON-TOPIC for the video's transformation. Reject items that are loosely related - we'd rather have 8 great anchors than 15 weak ones.

For each pick, give a 1-sentence reason why it belongs in THIS video.

Return ONLY a JSON object:
{
  "suggestions": [
    { "id": "<exact bank id from the input>", "why": "..." }
  ]
}

Hard rule: NO em dashes (U+2014). Plain hyphens only.`;

export async function suggestAnchorsForVideo(args: {
  videoTitle: string;
  transformation?: string | null;
  bank: BankItem[];
}): Promise<Array<{ id: string; why: string }>> {
  const lines = [
    `Video title: ${args.videoTitle}`,
    `Transformation: ${args.transformation ?? '(not specified - infer from title)'}`,
    '',
    `Available bank items (${args.bank.length} total):`,
    '',
    ...args.bank.map((item) => {
      const tag = `[${item.kind}]`;
      const title = item.title ? ` "${item.title}"` : '';
      const src = item.source_transcript ? ` (from ${item.source_transcript.replace(/\.(md|txt)$/, '')})` : '';
      // Keep text short for the suggest pass
      const snippet = item.text.length > 240 ? item.text.slice(0, 240) + '…' : item.text;
      return `--- ${item.id} ${tag}${title}${src} ---\n${snippet}`;
    }),
    '',
    'Pick 8-15 items for this video. Return JSON per the system prompt.',
  ].join('\n');

  const raw = await callBridge(SUGGEST_SYSTEM, lines, 4000);
  const parsed = parseJson(raw);
  const list = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  // Filter to valid IDs
  const validIds = new Set(args.bank.map((b) => b.id));
  return list
    .filter((s: any) => s?.id && validIds.has(s.id))
    .map((s: any) => ({ id: String(s.id), why: String(s.why ?? '').trim() }));
}

// ─── Draft script ────────────────────────────────────────────────────────

const DRAFT_SYSTEM = `You are synthesizing a YouTube script for the creator using ONLY her own verbatim bank items. She wrote all of this herself - she said these things on calls, in workshops, in past videos. Your job is to weave them into one cohesive script.

Hard rules:
1. Use ONLY phrasing from the bank items. Where you need to bridge between items, add minimal connective tissue (1-2 sentences max per bridge).
2. Light cleanup OK: strip "like", "kind of", "you know", "sort of", "I mean", restarts, repetition. Do NOT paraphrase or rewrite meaning.
3. Do NOT invent claims, examples, dollar amounts, names, or specifics not present in the bank items.
4. Do NOT use generic YouTube voice. BANNED phrases: "hey guys", "what's up", "in this video", "by the end of this video you'll", "let's dive in", "without further ado", "make sure to like and subscribe", "I'm going to show you", "stay tuned". the creator doesn't talk like this. She opens with a story or a moment, gets to the point, and lets the value speak.
5. The script should sound like the creator sat down and recorded the whole thing cleanly in one take using only ideas she's already said.
6. The script is PLAIN SPOKEN TEXT read off a teleprompter. NO markdown whatsoever: no # headings, no * or ** for bold/italic, no backticks, no -/* bullet markers. Plain sentences and paragraphs only. The "script" field must contain zero markdown symbols.

Target: 1500-3000 words (8-15 min spoken).

The bank items are presented in the order the user wants them used. Respect that order where possible, but you may regroup if the structure mode allows.

Structure modes:
- "infer": you pick the natural flow from the anchors you've been given. Look at what's available and design the arc.
- "fixed": open with personal story → reframe with POV → walk through frameworks in given order → close with CTA. Strict.
- "hybrid": start with fixed structure (story open, POV reframe, value sections, CTA close) but you may reorder anchors within each section for the best flow.

Return ONLY a JSON object:
{
  "title_suggestion": "if the working title could be sharper, a 1-line suggestion (lowercase, the creator's voice). Or null if the working title is already strong.",
  "script": "the full word-for-word script the creator will read",
  "outline": [
    { "section": "intro" | "reframe" | "value" | "cta" | "outro", "anchor_ids_used": ["..."], "summary": "1 line of what this section is" }
  ],
  "unused_anchors": ["<ids that didn't fit>"]
}

NO em dashes (U+2014). Plain hyphens only.`;

// ─── Sectioned variants - suggest per-section + draft per-section ────────

export type SectionKind = 'intro' | 'context' | 'value' | 'cta' | 'outro';
export type SectionDraftInput = {
  id: string;
  label: string;
  kind: SectionKind;
  brief: string;
  // Items the creator has already picked for this section. The prompt treats
  // these as LOCKED - Claude must keep them in place and only suggest
  // COMPLEMENTS that round out the section without conflicting. Empty
  // array means the section is open for fresh suggestions.
  locked_anchor_ids?: string[];
};

const SECTION_INTENTS: Record<SectionKind, string> = {
  intro: 'Emphasise the RESULT. Increase anticipation for the value the viewer is about to get. The hook is the size and specificity of the outcome - "what changed and how fast" - not just a curiosity gap. A personal story or proof moment can carry the intro, but the job of those is to frame the result, not just grab attention.',
  context: 'Set up the value sections. EITHER (a) shift a belief: name the wrong assumption the viewer is probably holding, and flip it with a contrarian POV. OR (b) give background framing the viewer needs to understand what comes next (history, definitions, why this matters now). The brief tells you which mode this video needs.',
  value: 'One teaching point. A named framework, a specific how, walked through end-to-end. Has its own WHY (what breaks without it), WHAT (the framework), HOW (steps), and PAYOFF (what changes).',
  cta: 'Soft pitch for the offer. Name the barrier (what implementing alone would cost in time/energy/uncertainty), name the shortcut (the offer), say what it includes, drop a casual invite. Not pushy. Usually mid-video or late-video, before the outro. Pulls from the offer context.',
  outro: 'Reinforce the transformation. Curiosity gap pointing at the next video. Tight sign-off. NOT a pitch - that\'s the CTA section\'s job. The outro is about keeping viewers on the channel.',
};

// Backward-compat: scripts persisted before context was renamed from 'reframe'
// still contain the old kind string. Normalise on the way in so prompts and
// downstream code don't break.
export function normalizeSectionKind(kind: string): SectionKind {
  if (kind === 'reframe') return 'context';
  if (kind === 'intro' || kind === 'context' || kind === 'value' || kind === 'cta' || kind === 'outro') return kind;
  return 'value'; // safe default
}

const SUGGEST_SECTIONED_SYSTEM = `You are the creator's content strategist. You have access to their approved verbatim bank items - core file sections, POVs, teaching frameworks, personal stories, proof / connection moments. Every one of these is something they actually wrote or said.

Your job: given a video's GOAL (what it teaches the viewer + the outcome they walk away with) and section briefs, assign bank items to EACH section based on what directly serves THIS specific video.

═══════════════════════════════════════════════════════════
THE GOAL IS THE FILTER. NOTHING ELSE MATTERS AS MUCH.
═══════════════════════════════════════════════════════════
Before you pick anything, hold the GOAL in your head. The goal tells you the SPECIFIC topic this video teaches. Every item you pick must directly help the creator teach THAT topic to THAT viewer.

Topical relevance test (run this for every candidate):
1. Read the goal. What is the specific subject? (e.g. "fix desk-worker posture in 10 minutes a day, without a standing desk")
2. Read the candidate's title + snippet.
3. Ask: would a viewer of this video, who wants exactly what the goal promises, find this item directly USEFUL or ILLUSTRATIVE for THAT subject?
4. If you'd have to stretch, hand-wave, or say "well it's about success/effort/audience generally" - REJECT it. Loose thematic match is not relevance.

Worked example of the topical filter (a neutral domain - the REASONING PATTERN is what matters here; the actual creator's goal and bank items arrive at runtime and may be in any niche). For a video whose goal is "fix desk-worker posture in 10 minutes a day, without a standing desk":

Loose-match items to REJECT:
- A personal "I ran my first marathon" story (about endurance, not about posture)
- A "you don't need a gym membership to get fit" framework (about access, not about posture)
- A proof point about a client losing 20 pounds (about weight loss, not about posture)
- A POV about consistency beating intensity (about mindset, not about posture)
These items can be GREAT for other videos. They are wrong for THIS one. Do not pick them.

Items that WOULD be on-topic for that video:
- A teaching framework about resetting the three joints that collapse when you sit
- A proof point where the coach or a client fixed chronic back pain with daily 10-minute resets
- A personal moment realising the chair, not the spine, was the problem
- A POV about why expensive ergonomic chairs treat the symptom, not the cause

Section intents (apply ONLY after the topical filter passes):
- intro: ${SECTION_INTENTS.intro}
- context: ${SECTION_INTENTS.context}
- value: ${SECTION_INTENTS.value}
- cta: ${SECTION_INTENTS.cta}
- outro: ${SECTION_INTENTS.outro}

Rules:
- THE GOAL IS HARD GATE. Loose theme match = reject. No exceptions.
- Empty sections are FINE and PREFERRED over forced picks. If nothing in the bank directly serves a section's brief AND the goal, return [] for that section.
- Quality > quantity. Most sections need 0-2 picks, not 4. A single perfect anchor beats three vague ones.
- The "why" field is your work being audited. It MUST start with "Serves the goal because..." and name the SPECIFIC link between the item and the goal's subject. If you can't write that sentence honestly, you shouldn't have picked the item.
- Read each section's brief CAREFULLY. The brief refines what THIS section needs within the goal. If brief is empty, fall back to the section's general intent - but the goal still gates.
- intros: pick 1-2 items max. Prefer proof moments or personal stories that frame the SPECIFIC outcome named in the goal.
- context: pick 1-2 items max. POVs that flip the wrong belief about THIS subject, or background framing about THIS subject.
- value sections: **EACH VALUE SECTION IS ONE COHERENT TEACHING POINT.** Pick ONE teaching framework that drives the section's specific point home, then OPTIONALLY pair it with a proof point OR a connection story that directly demonstrates THAT SAME teaching point. Every item in a value section must be about the same single point - if your framework is about "the three-joint reset" then the proof must be about that exact thing, not a generic "a client got healthier" win. If you can't find a proof or story that demonstrates THIS specific framework, leave it framework-only. Do NOT stuff a section with unrelated wins or stories just because the section is "value". Typical shape: 1 framework + 1 demo (proof or story). Max 3 items per value section, and only if all 3 hammer the same point.
- **value sections must be DISTINCT teaching points from each other.** value-1 teaches point A, value-2 teaches point B, value-3 teaches point C - they're different angles on the goal, not three takes on the same idea.
- cta: pick 0-1 items. **NO STORIES in the CTA.** The CTA is a soft pitch, not narrative time. If you pick anything at all, pick a single proof point that establishes the creator's authority on THIS subject so the offer feels earned. Most CTAs need 0 items - Claude writes the pitch from scratch using context, not bank items.
- outro: usually 0 picks. Leave empty unless a single story closes the loop on THIS subject.
- Each anchor appears in AT MOST ONE section.

═══════════════════════════════════════════════════════════
LOCKED ITEMS (the arc the creator is setting)
═══════════════════════════════════════════════════════════
When sections have "locked" picks, the creator has already committed to those items. They are NON-NEGOTIABLE in three ways:

1. **STRUCTURAL:** You CANNOT remove them, replace them, or re-suggest them. The frontend already has them; only return NEW picks.

2. **PER-SECTION complement rule:** Your suggestions for a section with locks must COMPLEMENT the locks, not duplicate or compete with them.
   - A locked framework gets a proof or connection story that DEMONSTRATES THAT EXACT framework. Never a second framework.
   - A locked story or proof gets the framework that the moment teaches.
   - The complement must be on the SAME teaching point as the locked item. If the locked framework is about "the three-joint reset," then the proof you add must demonstrate that exact thing - not a general win.
   - If the section already has enough (typically 2-3 items that all hammer the same point), ADD NOTHING. Return an empty picks array for that section.

3. **GLOBAL arc rule (this is the big one):** The locked picks across ALL sections together reveal the SPECIFIC arc the creator wants. The angle. The sub-topics. The narrative thread.
   - For sections WITHOUT locks (open / empty sections), do NOT just suggest items that match the goal in the abstract. Suggest items that fit the arc the locked picks reveal.
   - Example (neutral domain): video goal is "fix desk-worker posture in 10 minutes a day." The creator has locked a framework about "the three-joint reset" in value-1 and a story about "the client who couldn't sit through a meeting without back pain" in value-2. That tells you the arc is concrete: quick daily posture resets for desk workers, not general fitness. For the intro, pick a proof of THAT specific outcome (a desk worker whose pain went away in two weeks). For context, pick a POV that flips the wrong belief about THAT (e.g. "you need a standing desk to fix your posture"). For value-3, pick a framework that extends THAT arc (e.g. "how to build the reset into your workday so you actually do it"). Reject items that are vaguely about fitness or general wellness wins.
   - The arc filter is STRICTER than the goal filter. The goal sets the subject. The arc sets the specific take on the subject.

Return ONLY JSON in this shape:
{
  "assignments": [
    { "section_id": "<id>", "picks": [{ "anchor_id": "<id>", "why": "Serves the goal because <specific link to the goal's subject>" }] }
  ]
}

NO em dashes (U+2014). Plain hyphens only.`;

export async function suggestAnchorsBySection(args: {
  videoTitle: string;
  transformation?: string | null;
  sections: SectionDraftInput[];
  bank: BankItem[];
}): Promise<Array<{ section_id: string; picks: Array<{ anchor_id: string; why: string }> }>> {
  const goal = (args.transformation ?? '').trim();

  // Roll up every locked item across the entire video. the creator's picks tell
  // you the SHAPE of the video she wants - the angle, the specific
  // sub-topics, the arc. The empty/open sections should be filled with
  // items that fit THAT shape, not with generic on-goal items. This
  // global block goes BEFORE the per-section blocks so Claude reads the
  // arc first, then picks complements for each section through that lens.
  const globalLocks = args.sections.flatMap((s) =>
    (s.locked_anchor_ids ?? [])
      .map((id) => args.bank.find((b) => b.id === id))
      .filter((b): b is BankItem => !!b)
      .map((b) => ({ section: `${s.label} (${s.kind})`, item: b }))
  );

  const lines = [
    '╔══════════════════════════════════════════════════════════╗',
    '║  THE GOAL OF THIS VIDEO (your ONLY filter for relevance)  ║',
    '╚══════════════════════════════════════════════════════════╝',
    goal || '(NO GOAL SET - the user did not fill in "goal of this video" on the card. Ask yourself: would you stake your reputation on this pick being on-topic? If not, leave the section empty.)',
    '',
    `Video working title: ${args.videoTitle}`,
    '',
    globalLocks.length > 0
      ? [
          '╔══════════════════════════════════════════════════════════╗',
          '║  THE ARC THE CREATOR SET (locked picks across the video) ║',
          '╚══════════════════════════════════════════════════════════╝',
          'the creator has already committed to the items below. They reveal the SPECIFIC',
          'angle, sub-topics, and arc they want this video to follow. Read them',
          'carefully. EVERY suggestion you make for ANY section must fit this arc',
          '- not just the goal in the abstract. If a candidate item is technically',
          'on-goal but does not echo / extend / set up / pay off the arc the creator has',
          'committed to here, REJECT it.',
          '',
          ...globalLocks.map(({ section, item }) => {
            const t = item.title ? ` "${item.title}"` : '';
            const sn = item.text.length > 260 ? item.text.slice(0, 260) + '…' : item.text;
            return `  ◆ in ${section} · ${item.id} [${item.kind}]${t}\n    ${sn}`;
          }),
          '',
        ].join('\n')
      : '(no locks yet - this is a fresh suggest. Pick from scratch using the goal alone.)',
    '',
    '─── Sections (each has a brief that further narrows the section\'s job) ───',
    ...args.sections.map((s) => {
      const lockedIds = s.locked_anchor_ids ?? [];
      const locked = lockedIds
        .map((id) => args.bank.find((b) => b.id === id))
        .filter((b): b is BankItem => !!b);
      const lockedBlock = locked.length === 0
        ? '\nlocked picks: (none - section is open, suggest from scratch)'
        : `\nlocked picks (DO NOT remove, DO NOT re-suggest, only COMPLEMENT these):\n${locked
            .map((b) => {
              const t = b.title ? ` "${b.title}"` : '';
              const sn = b.text.length > 220 ? b.text.slice(0, 220) + '…' : b.text;
              return `  • ${b.id} [${b.kind}]${t}\n    ${sn}`;
            })
            .join('\n')}`;
      return `\n[ section_id="${s.id}" · ${s.label} · kind=${s.kind} ]\nbrief: ${s.brief?.trim() || '(no brief - use the kind intent, but THE GOAL still gates relevance)'}${lockedBlock}`;
    }),
    '',
    `─── Bank items (${args.bank.length}) - ALL kinds, judge each against THE GOAL above ───`,
    '',
    ...args.bank.map((item) => {
      const tag = `[${item.kind}]`;
      const title = item.title ? ` "${item.title}"` : '';
      const src = item.source_transcript ? ` (from ${item.source_transcript.replace(/\.(md|txt)$/, '')})` : '';
      // 500 chars (was 200) so Claude can see enough to judge relevance
      // without guessing. Truncated items led to "well it sounds related"
      // picks that turned out off-topic when expanded.
      const snippet = item.text.length > 500 ? item.text.slice(0, 500) + '…' : item.text;
      return `── ${item.id} ${tag}${title}${src} ──\n${snippet}`;
    }),
    '',
    '─── Reminder before you assign ───',
    'For every pick: would a viewer who clicked this video specifically to learn about',
    goal ? `"${goal}"` : 'the goal above',
    'find this item directly useful? If you have to bend the link, REJECT it.',
    'Empty sections are correct when nothing fits. Forced picks make the creator look generic.',
    '',
    'Return ONLY the JSON described in the system prompt.',
  ].join('\n');

  const raw = await callBridge(SUGGEST_SECTIONED_SYSTEM, lines, 6000);
  const parsed = parseJson(raw);
  const list = Array.isArray(parsed?.assignments) ? parsed.assignments : [];
  const validIds = new Set(args.bank.map((b) => b.id));
  const validSections = new Set(args.sections.map((s) => s.id));
  // Belt-and-suspenders: strip any IDs already locked across the whole
  // video. The system prompt tells Claude not to re-suggest locked items
  // but we enforce here too in case the model slips. This also catches
  // any cross-section duplication where Claude tries to put the same item
  // in two sections.
  const lockedAcrossVideo = new Set<string>();
  for (const s of args.sections) for (const id of s.locked_anchor_ids ?? []) lockedAcrossVideo.add(id);
  const newlyUsed = new Set<string>();
  return list
    .filter((a: any) => validSections.has(a?.section_id))
    .map((a: any) => ({
      section_id: String(a.section_id),
      picks: (Array.isArray(a.picks) ? a.picks : [])
        .filter((p: any) => p?.anchor_id && validIds.has(p.anchor_id))
        .filter((p: any) => !lockedAcrossVideo.has(p.anchor_id))
        .filter((p: any) => {
          if (newlyUsed.has(p.anchor_id)) return false;
          newlyUsed.add(p.anchor_id);
          return true;
        })
        .map((p: any) => ({ anchor_id: String(p.anchor_id), why: String(p.why ?? '').trim() })),
    }));
}

// Synthesize one section in isolation. The prompt is the same DNA but scoped
// to the section's intent + brief + only its anchors.
const DRAFT_SECTION_SYSTEM = `You are writing one section of a YouTube script for the creator. Use ONLY the verbatim bank items provided. the creator said all of this herself - your job is to weave the relevant pieces into this single section.

Hard rules:
1. Use ONLY phrasing from the bank items. Where you need to bridge between items, add minimal connective tissue (1-2 sentences max per bridge).
2. Light cleanup OK: strip "like", "kind of", "you know", "sort of", "I mean", restarts. Do NOT paraphrase.
3. Do NOT invent claims, examples, dollar amounts, names, or specifics not in the bank items.
4. Do NOT use generic YouTube voice. BANNED phrases: "hey guys", "what's up", "in this video", "by the end of this video you'll", "let's dive in", "without further ado", "make sure to like and subscribe", "I'm going to show you", "stay tuned".
5. Match the section's intent and the user's brief. The brief tells you exactly what the creator wants this section to do for THIS video.
6. Target section length: intro 150-300 words, reframe 200-400 words, value 300-600 words each, outro 100-200 words.

Return ONLY JSON:
{
  "text": "the section's full word-for-word script - what the creator will read"
}

NO em dashes (U+2014). Plain hyphens only.`;

export async function draftOneSection(args: {
  videoTitle: string;
  transformation?: string | null;
  cta?: string | null;
  section: { id: string; label: string; kind: SectionKind; brief: string };
  anchors: BankItem[];
}): Promise<string> {
  const lines = [
    `Video title: ${args.videoTitle}`,
    `Transformation: ${args.transformation ?? '(infer)'}`,
    `CTA: ${args.cta ?? '(no CTA configured - set one in Settings)'}`,
    '',
    `Section: ${args.section.label} (kind=${args.section.kind})`,
    `Brief: ${args.section.brief || '(no brief - use kind intent)'}`,
    `Section intent: ${SECTION_INTENTS[args.section.kind]}`,
    '',
    `Anchors (${args.anchors.length}):`,
    '',
    ...args.anchors.map((item, i) => {
      const tag = `[${item.kind}]`;
      const title = item.title ? ` "${item.title}"` : '';
      const src = item.source_transcript ? ` (from ${item.source_transcript.replace(/\.(md|txt)$/, '')})` : '';
      return `--- anchor ${i + 1} -- ${item.id} ${tag}${title}${src} ---\n${item.text}`;
    }),
    '',
    'Write this section per the rules. Return JSON.',
  ].join('\n');

  const raw = await callBridge(DRAFT_SECTION_SYSTEM, lines, 4000);
  const parsed = parseJson(raw);
  const text = String(parsed?.text ?? '').trim();
  if (!text) throw new Error(`empty section: ${args.section.id}`);
  return text;
}

export async function draftScriptFromAnchors(args: {
  videoTitle: string;
  transformation?: string | null;
  cta?: string | null;
  anchors: BankItem[];
  mode: StructureMode;
}): Promise<{
  title_suggestion: string | null;
  script: string;
  outline: Array<{ section: string; anchor_ids_used: string[]; summary: string }>;
  unused_anchors: string[];
}> {
  const lines = [
    `Video title: ${args.videoTitle}`,
    `Transformation: ${args.transformation ?? '(infer)'}`,
    `CTA: ${args.cta ?? '(no CTA configured - set one in Settings)'}`,
    `Structure mode: ${args.mode}`,
    '',
    `Anchors in order (${args.anchors.length} items):`,
    '',
    ...args.anchors.map((item, i) => {
      const tag = `[${item.kind}]`;
      const title = item.title ? ` "${item.title}"` : '';
      const src = item.source_transcript
        ? ` (from ${item.source_transcript.replace(/\.(md|txt)$/, '')}${item.source_timestamp ? ` @ ${item.source_timestamp}` : ''})`
        : '';
      return `--- ANCHOR ${i + 1} of ${args.anchors.length} -- ${item.id} ${tag}${title}${src} ---\n${item.text}`;
    }),
    '',
    'Weave these into one cohesive YouTube script per the system prompt rules. Return JSON.',
  ].join('\n');

  const raw = await callBridge(DRAFT_SYSTEM, lines, 14000);
  const parsed = parseJson(raw);
  const script = String(parsed?.script ?? '').trim();
  if (!script) throw new Error('synthesizer returned no script');
  const outline = Array.isArray(parsed?.outline) ? parsed.outline : [];
  const unused = Array.isArray(parsed?.unused_anchors) ? parsed.unused_anchors.map(String) : [];
  return {
    title_suggestion: parsed?.title_suggestion ? String(parsed.title_suggestion).trim() : null,
    script,
    outline,
    unused_anchors: unused,
  };
}
