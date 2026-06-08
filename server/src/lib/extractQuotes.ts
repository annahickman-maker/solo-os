/**
 * Extract verbatim quotes AND synthesized stories from a transcript via the
 * local Claude bridge.
 *
 * Two kinds of output:
 *   1. QUOTES     - individual verbatim moments from Anna. No paraphrasing.
 *                   Tagged as pov / value / authority / connection (one-to-one with the 4 Reputation dimensions).
 *   2. STORIES    - clusters of related quotes on the same topic, combined
 *                   into one cohesive piece. Light cleanup ONLY: filler words
 *                   ("like", "kind of", "you know"), restarts, repetition, and
 *                   transitions smoothed. Meaning and the creator's phrasing stay intact.
 *                   Each story tracks its source moments (timestamps + originals).
 *
 * Both shapes flow through the same approve/queue pipeline downstream.
 */

import fs from 'node:fs';
import { personalize } from './creatorContext.js';

const BRIDGE_URL = 'http://localhost:8789/run';

// Tags mirror the 4 Reputation dimensions, one-to-one.
export type QuoteTag = 'pov' | 'value' | 'authority' | 'connection';

// Persisted entries from older versions of this app used different tag names.
// Normalise on read so prompts and downstream code see the new values.
// For ambiguous old 'proof-connection' tags, we use a heuristic on the text:
// if it contains dollar signs, percentages, or subscriber/follower counts,
// it's probably authority/proof; otherwise it's connection.
export function normalizeQuoteTag(t: string, text?: string): QuoteTag {
  if (t === 'personal-story') return 'connection';
  if (t === 'teaching-framework') return 'value';
  if (t === 'proof') return 'authority';
  if (t === 'proof-connection') {
    if (!text) return 'connection';
    const proofSignals = /\$\s?\d|\d+\s?(k|K|m|M)\b|\d{1,3},\d{3}|\d+\s?(month|year|week|day)|subs(cribers?)?\b|followers?\b|\d+\s?percent|\d+\s?%|launched|hit \$|\d+x\b/i;
    return proofSignals.test(text) ? 'authority' : 'connection';
  }
  if (t === 'pov' || t === 'value' || t === 'authority' || t === 'connection') return t;
  return 'connection';
}

export type SourceMoment = {
  text: string;       // original verbatim with filler
  timestamp: string;
};

export type ExtractedQuote = {
  id: string;
  text: string;
  tag: QuoteTag;
  context: string;
  timestamp: string;
  source_transcript_id: string;
  source_transcript_filename: string;
  // status is now ONLY pending vs dismissed. Approval and IG queue are
  // independent boolean flags so a quote can be both approved AND queued.
  status: 'pending' | 'dismissed';
  // Bank approval (orthogonal to IG queue)
  approved_to?: QuoteTag;
  approved_at?: number;
  approved_path?: string;
  approved_bank_id?: string;
  // IG queue (orthogonal to approval)
  in_ig_queue?: boolean;
  ig_queue_id?: string;
  queued_at?: number;
  created_at: number;
  updated_at: number;
  // For synthesized stories - the moments that fed it. Empty for individual quotes.
  source_moments?: SourceMoment[];
  // Optional short title for synthesized stories (1 line).
  title?: string;
  // Discriminator
  kind?: 'quote' | 'story';
  // the creator's freeform topic chips (e.g. 'imposter syndrome', 'content strategy').
  // Distinct from `tag` (the dim category). Used to find quotes across
  // transcripts when picking anchors for a script.
  topics?: string[];
};

const SYSTEM_PROMPT = `You are mining one of the creator's transcripts (a Q&A call, strategy call, workshop, or video) for content she can re-use.

You produce TWO kinds of output:

1. QUOTES - single notable moments. Pure verbatim - the exact words Anna said, including filler words like "like", "kind of", "you know", restarts. Do not clean these up. Each quote is a self-contained moment worth banking on its own.

2. STORIES - cohesive pieces synthesized from MULTIPLE related quotes covering the same topic. Light cleanup only:
   - REMOVE filler ("like", "kind of", "you know", "sort of", "I mean", "right?", "you know what I mean")
   - REMOVE restarts and false starts ("I was, I was going to..." -> "I was going to...")
   - REMOVE repetition where she said the same thing twice
   - SMOOTH transitions between related quotes so they read as one cohesive thought
   - PRESERVE her exact phrasing, word choice, voice. Do NOT paraphrase or "improve" the meaning. If she said "the audience that wants to do it themselves", do not change it to "the DIY audience". Keep her words.
   - The story should sound like Anna sat down and recorded it cleanly in one take.

When to produce a story vs. just leave quotes individual:
- If 2+ quotes in the transcript cover the same topic / build the same argument / share the same insight - SYNTHESIZE them into a story.
- If a quote stands alone (a one-liner POV, a single anecdote) - leave it as an individual quote.
- A transcript may have multiple stories (e.g. one about content strategy, one about offers, one about mindset).

Both quotes AND stories get tagged with EXACTLY ONE of these 4 (matching the creator's 4 Reputation dimensions):
- "pov" → opinion, contrarian take, belief about how things work or should work
- "value" → a teaching moment: naming or walking through a system, framework, process, or set of steps that delivers insight
- "authority" → concrete evidence of a result. A named subject (Anna or a student/client) + a specific outcome (dollar amount, subscriber count, conversion rate, time-to-result) + the gap that makes it remarkable (small audience, no list, fast turnaround). NUMBERS and SPECIFICS are the marker.
- "connection" → a vulnerable, relatable, or lived-experience moment. Either Anna recounting something that happened to her (a personal story, an anecdote, what she did, how she felt) OR Anna saying something the audience will feel in their chest ("I was scared too", "I felt the same way", "I didn't believe it either", "this is what I'm still figuring out"). The defining test: does this make a viewer feel less alone? If yes, it's connection.

The authority / connection split:
- "We had $50K month after starting from scratch" → AUTHORITY (specific number, specific outcome)
- "I was honestly terrified the whole first year" → CONNECTION (feeling, no number)
- "my student launched at $2,500 with 42 subscribers" → AUTHORITY
- "I felt exactly the same way you do right now" → CONNECTION
- A story that has BOTH (e.g. "I was a broke freelancer making $11K/month and I felt like a fraud") → tag as the dominant beat. If the beat is the number, it's authority. If the beat is the feeling, it's connection. If genuinely split, pick CONNECTION.

Anna only. Never quote other attendees as the speaker. (Their questions can show up in the "context" field for QUOTES, or be referenced in story setup.)

PRIORITIZATION for individual quotes:
- Connection and authority are the highest-value individual quotes - they're what makes short-form content actually land emotionally and convince. Be greedy with both. Pull every moment where Anna shares a lived experience, a vulnerable line, a "me too" feeling, OR a specific result with a name and a number.
- POVs and value moments are valuable too, but they often cluster into STORIES (synthesized). When several POVs are about the same topic, prefer to combine them into a story rather than listing each individually. Reserve individual POV quotes for one-liners that stand alone with punch.
- Net effect: individual quotes should skew toward connection and authority. Stories should skew toward pov and value.

PROOF GOLD - always pull as individual quotes:
A moment is PROOF GOLD if it contains ALL of:
  (a) a specific subject - a named student/client, or Anna herself in a specific past chapter
  (b) a specific outcome - a dollar amount, subscriber count, conversion number, time-to-result
  (c) the gap that makes the outcome remarkable - small audience, no list, scrappy setup, no experience

Examples of PROOF GOLD (always pull standalone, tag as "authority"):
- "one of my students launched at $2,500 with 24 followers"
- "I hit $52K in a month after starting from scratch a year before"
- "she had 400 subscribers when she got her first $5K client"
- "I went from $11K/month freelancing to $10K/month with one digital product"

These ALWAYS appear as their own individual quote, even if the same moment ALSO feeds into a larger synthesized story. Duplicate the source moment - the standalone quote serves a different purpose (drop into a future video as proof), and the story-version serves another (cohesive teaching arc). Both versions get returned. Never silently absorb a proof moment into a story without ALSO surfacing it as a quote.

Be thorough. There is no limit on how many quotes or stories to return. A 90-minute Q&A call should produce 15-30+ quotes plus 2-5 stories. Quality over quantity, but err on the side of more if you're unsure - especially for connection and authority moments.

Return ONLY a JSON object in this exact shape:

{
  "quotes": [
    {
      "text": "exact verbatim quote from Anna",
      "tag": "pov" | "value" | "authority" | "connection",
      "context": "1-2 sentences describing what triggered this quote",
      "timestamp": "HH:MM:SS"
    }
  ],
  "stories": [
    {
      "title": "short label for what this story is about (5-10 words)",
      "text": "the synthesized story - the creator's voice, fillers stripped, multiple quotes woven into one cohesive piece. Reads as one continuous thought.",
      "tag": "pov" | "value" | "authority" | "connection",
      "context": "1-2 sentences describing the topic this story addresses",
      "source_moments": [
        { "text": "first original verbatim quote that fed this story", "timestamp": "HH:MM:SS" },
        { "text": "second original quote", "timestamp": "HH:MM:SS" }
      ]
    }
  ]
}

Hard rules:
- NO em dashes (U+2014) anywhere. Plain hyphens only.
- Never invent. If you're not sure she said something, skip it.
- Story text must trace back to her actual words. You're a editor lightly tidying, not a writer.
- If a transcript has nothing worth banking, return {"quotes": [], "stories": []}.`;

async function callClaude(system: string, user: string, maxTokens = 16000): Promise<string> {
  // Hard 7-minute timeout. A successful run on a 226KB transcript takes ~3min;
  // anything past 7min is stuck. Better to fail fast and let the UI show a
  // clear error than to hang the user's browser indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7 * 60 * 1000);
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'extractQuotes',
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
      throw new Error('extraction timed out after 7 minutes - the transcript may be too long, or claude is stuck. try a shorter transcript or wait a minute and retry.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

const VALID_TAGS: ReadonlySet<QuoteTag> = new Set([
  'pov',
  'value',
  'authority',
  'connection',
]);

function parseClaudeJson(raw: string): { quotes: any[]; stories: any[] } {
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`Could not parse Claude response as JSON: ${raw.slice(0, 200)}`);
    parsed = JSON.parse(m[0]!);
  }
  const quotes = Array.isArray(parsed?.quotes) ? parsed.quotes : Array.isArray(parsed) ? parsed : [];
  const stories = Array.isArray(parsed?.stories) ? parsed.stories : [];
  return { quotes, stories };
}

// Cap at ~150K chars (~40K tokens). With system prompt + generation overhead,
// keeps total runtime under ~4 min even for huge calls. Truncating at the END
// for long client calls is safer than truncating at the start (which would cut
// the wrap-up where Anna often summarizes the call).
const MAX_TRANSCRIPT_CHARS = 150_000;

export async function extractQuotesFromTranscript(args: {
  transcriptId: string;
  transcriptFilename: string;
  transcriptText: string;
}): Promise<ExtractedQuote[]> {
  const text = args.transcriptText.length > MAX_TRANSCRIPT_CHARS
    ? args.transcriptText.slice(0, MAX_TRANSCRIPT_CHARS)
    : args.transcriptText;

  const userPrompt = [
    `Transcript: ${args.transcriptFilename}`,
    '',
    'Mine this transcript per the system prompt. Return BOTH individual quotes AND synthesized stories where applicable. Cover the entire transcript - do not stop early.',
    '',
    '--- TRANSCRIPT ---',
    text,
    '--- END TRANSCRIPT ---',
  ].join('\n');

  const raw = await callClaude(SYSTEM_PROMPT, userPrompt);
  const { quotes, stories } = parseClaudeJson(raw);
  const now = Math.floor(Date.now() / 1000);

  const out: ExtractedQuote[] = [];

  // Synthesized stories first (they're the higher-value output Anna asked for)
  for (const item of stories) {
    const text = String(item?.text ?? '').trim();
    const tag = String(item?.tag ?? '').trim() as QuoteTag;
    if (!text || !VALID_TAGS.has(tag)) continue;
    const sourceMoments: SourceMoment[] = Array.isArray(item.source_moments)
      ? item.source_moments
          .map((m: any) => ({
            text: String(m?.text ?? '').trim(),
            timestamp: String(m?.timestamp ?? '').trim(),
          }))
          .filter((m: SourceMoment) => m.text)
      : [];
    out.push({
      id: `s-${args.transcriptId}-${out.length + 1}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      tag,
      title: String(item?.title ?? '').trim() || undefined,
      context: String(item?.context ?? '').trim(),
      timestamp: sourceMoments[0]?.timestamp ?? '',
      source_transcript_id: args.transcriptId,
      source_transcript_filename: args.transcriptFilename,
      status: 'pending',
      kind: 'story',
      source_moments: sourceMoments,
      created_at: now,
      updated_at: now,
    });
  }

  // Individual quotes
  for (const item of quotes) {
    const text = String(item?.text ?? '').trim();
    const tag = String(item?.tag ?? '').trim() as QuoteTag;
    if (!text || !VALID_TAGS.has(tag)) continue;
    out.push({
      id: `q-${args.transcriptId}-${out.length + 1}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      tag,
      context: String(item?.context ?? '').trim(),
      timestamp: String(item?.timestamp ?? '').trim(),
      source_transcript_id: args.transcriptId,
      source_transcript_filename: args.transcriptFilename,
      status: 'pending',
      kind: 'quote',
      created_at: now,
      updated_at: now,
    });
  }

  return out;
}

// ─── Combine selected quotes into a single synthesized story ──────────────

const COMBINE_PROMPT = `You are taking several verbatim quotes that Anna has personally selected and combining them into ONE cohesive piece of content.

Rules:
- Light cleanup ONLY: strip "like", "kind of", "you know", "sort of", "I mean", "right?", restarts, repetition.
- Smooth transitions between the quotes so it reads as one continuous thought.
- DO NOT paraphrase or "improve" her meaning or word choice. Keep her phrasing intact.
- The result should sound like she sat down and recorded the whole thing cleanly in one take.
- The order of quotes in the input is the order Anna wants them. Respect that order, but you may add small connective tissue ("And here's where it gets interesting...", "Same thing happened with...", "The proof is...") to bridge them.
- Add a short title (5-10 words) describing what the combined story is about.
- Tag the combined story with EXACTLY ONE of: pov / teaching-framework / personal-story / proof-connection. Pick the dominant theme.

Return ONLY a JSON object:
{
  "title": "short label",
  "text": "the combined story",
  "tag": "pov" | "teaching-framework" | "personal-story" | "proof-connection",
  "context": "1-2 sentences naming the topic this combined story addresses"
}

Hard rule: NO em dashes (U+2014). Plain hyphens only.`;

export async function combineQuotesIntoStory(args: {
  transcriptId: string;
  transcriptFilename: string;
  quotes: ExtractedQuote[];
}): Promise<ExtractedQuote> {
  // Build the input for Claude, labeling stories vs individual quotes so the
  // model knows it's expanding an existing synthesized piece, not just
  // listing more verbatim moments.
  const numberedInput = args.quotes
    .map((q, i) => {
      const kindLabel = q.kind === 'story' ? 'STORY (already synthesized)' : 'QUOTE (verbatim)';
      const tsLabel = q.timestamp || (q.kind === 'story' ? `${q.source_moments?.length ?? 0} moments` : 'n/a');
      return `Item ${i + 1} - ${kindLabel} [${tsLabel}] (tag: ${q.tag})${q.title ? ` - "${q.title}"` : ''}:\n"${q.text}"`;
    })
    .join('\n\n');

  const userPrompt = [
    `Source transcript: ${args.transcriptFilename}`,
    '',
    `Anna selected these ${args.quotes.length} items to combine into one cohesive story.`,
    'Some items may already be synthesized stories (treat their text as a starting point);',
    'others are verbatim quotes (treat them as new material to weave in). Preserve the order.',
    '',
    numberedInput,
    '',
    'Combine them per the system prompt rules. Return JSON.',
  ].join('\n');

  const raw = await callClaude(COMBINE_PROMPT, userPrompt, 8000);
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('combine: could not parse response');
    parsed = JSON.parse(m[0]!);
  }

  const text = String(parsed?.text ?? '').trim();
  const tag = String(parsed?.tag ?? '').trim() as QuoteTag;
  if (!text || !VALID_TAGS.has(tag)) {
    throw new Error('combine: invalid response from claude');
  }

  // Flatten source_moments. If a selected item is itself a story, expand its
  // moments (so the merged story keeps the original verbatim attribution chain).
  // Individual quotes become a single moment each.
  const flatMoments: SourceMoment[] = [];
  const seen = new Set<string>();
  for (const item of args.quotes) {
    if (item.kind === 'story' && Array.isArray(item.source_moments) && item.source_moments.length > 0) {
      for (const m of item.source_moments) {
        const key = `${m.timestamp}|${m.text.slice(0, 60)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        flatMoments.push({ text: m.text, timestamp: m.timestamp });
      }
    } else {
      const key = `${item.timestamp}|${item.text.slice(0, 60)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flatMoments.push({ text: item.text, timestamp: item.timestamp });
    }
  }

  const now = Math.floor(Date.now() / 1000);
  return {
    id: `c-${args.transcriptId}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    tag,
    title: String(parsed?.title ?? '').trim() || undefined,
    context: String(parsed?.context ?? '').trim(),
    timestamp: flatMoments[0]?.timestamp ?? args.quotes[0]?.timestamp ?? '',
    source_transcript_id: args.transcriptId,
    source_transcript_filename: args.transcriptFilename,
    status: 'pending',
    kind: 'story',
    source_moments: flatMoments,
    created_at: now,
    updated_at: now,
  };
}

// ─── Scratchpad bank (00_System/extracted-quotes.json) ─────────────────────

export type ExtractedQuotesBank = {
  quotes: ExtractedQuote[];
  updated_at: number;
};

export function readBank(path: string): ExtractedQuotesBank {
  try {
    const raw = fs.readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    let bank: ExtractedQuotesBank;
    if (Array.isArray(parsed?.quotes)) bank = parsed as ExtractedQuotesBank;
    else if (Array.isArray(parsed)) bank = { quotes: parsed, updated_at: 0 };
    else return { quotes: [], updated_at: 0 };
    // Migrate old tag names in-flight so the UI and downstream code see new ones.
    for (const q of bank.quotes) q.tag = normalizeQuoteTag(q.tag as string, q.text);
    return bank;
  } catch {}
  return { quotes: [], updated_at: 0 };
}

export function writeBank(path: string, bank: ExtractedQuotesBank): void {
  bank.updated_at = Math.floor(Date.now() / 1000);
  fs.writeFileSync(path, JSON.stringify(bank, null, 2));
}
