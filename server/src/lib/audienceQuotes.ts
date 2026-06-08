/**
 * Audience-quote extraction.
 *
 * Pulls quotes spoken BY other people (audience members, students, callers,
 * clients) from a transcript - NOT Anna herself. Each quote is classified as
 * either a "struggle" (something they're dealing with) or a "want" (something
 * they're trying to achieve). Anna then attaches each quote to a specific
 * avatar and can optionally promote one to the proof bank as a customer
 * testimonial.
 *
 * Storage: 00_System/audience-quotes.json
 */

import fs from 'node:fs';
import { personalize } from './creatorContext.js';
import path from 'node:path';
import { abs } from '../vault.js';

const BRIDGE_URL = 'http://localhost:8789/run';
const AUDIENCE_BANK = abs('00_System', 'audience-quotes.json');
const MAX_TRANSCRIPT_CHARS = 100_000;

export type AudienceQuoteCategory = 'struggle' | 'desire' | 'win';

// Legacy data on disk may have category='want' (old label) or 'unsorted'
// (removed). Normalise everything to 'struggle', 'desire', or 'win'.
function normalizeCategory(v: unknown): AudienceQuoteCategory {
  if (v === 'struggle' || v === 'desire' || v === 'win') return v;
  if (v === 'want') return 'desire';
  // Unknown / unsorted / missing → treat as a struggle by default. Anna can
  // flip it to desire/win with one chip click.
  return 'struggle';
}
export type AudienceQuoteStatus = 'pending' | 'dismissed';

export interface AudienceQuote {
  id: string;
  text: string;             // verbatim (cleaned) audience speech
  speaker_label: string;    // "Student", "Caller", a name, or "Unknown"
  category: AudienceQuoteCategory;
  // Title that summarises the struggle/desire/win in the audience member's
  // own voice (first or second person, no avatar names). Used as the headline
  // above the quote. Renamed from the old `context` field.
  title: string;
  timestamp: string;        // [hh:mm:ss] if present in transcript
  source_transcript_id: string;
  source_transcript_filename: string;
  avatar_id: string | null;
  status: AudienceQuoteStatus;
  approved_proof_id?: string;
  approved_at?: number;
  created_at: number;
  updated_at: number;
}

interface Bank {
  quotes: AudienceQuote[];
}

export function readBank(): Bank {
  try {
    const raw = fs.readFileSync(AUDIENCE_BANK, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.quotes)) {
      // Normalise legacy values on every read:
      //  - category=='want'/'unsorted' → struggle/desire (see normalizeCategory)
      //  - `context` (old field name) → `title` (new field name)
      const quotes = (parsed.quotes as any[]).map((q) => {
        const title = typeof q.title === 'string' && q.title
          ? q.title
          : typeof q.context === 'string'
            ? q.context
            : '';
        const out: AudienceQuote = {
          id: q.id,
          text: typeof q.text === 'string' ? q.text : '',
          speaker_label: typeof q.speaker_label === 'string' ? q.speaker_label : 'Student',
          category: normalizeCategory(q.category),
          title,
          timestamp: typeof q.timestamp === 'string' ? q.timestamp : '',
          source_transcript_id: q.source_transcript_id ?? '',
          source_transcript_filename: q.source_transcript_filename ?? '',
          avatar_id: typeof q.avatar_id === 'string' && q.avatar_id ? q.avatar_id : null,
          status: q.status === 'dismissed' ? 'dismissed' : 'pending',
          approved_proof_id: typeof q.approved_proof_id === 'string' ? q.approved_proof_id : undefined,
          approved_at: typeof q.approved_at === 'number' ? q.approved_at : undefined,
          created_at: typeof q.created_at === 'number' ? q.created_at : 0,
          updated_at: typeof q.updated_at === 'number' ? q.updated_at : 0,
        };
        return out;
      });
      return { quotes };
    }
  } catch {}
  return { quotes: [] };
}

export function writeBank(bank: Bank): void {
  fs.mkdirSync(path.dirname(AUDIENCE_BANK), { recursive: true });
  fs.writeFileSync(AUDIENCE_BANK, JSON.stringify(bank, null, 2));
}

// ─── Claude call ──────────────────────────────────────────────────────────

async function callBridge(system: string, user: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4 * 60 * 1000);
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'audienceQuotes', system: personalize(system), user, maxTokens: 6000, expectJson: true }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`claude-bridge ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error) throw new Error(`claude-bridge: ${data.error}`);
    if (!data.text) throw new Error('claude-bridge: no text in response');
    return data.text;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('audience-quote extraction timed out after 4 minutes.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

const SYSTEM_PROMPT = `You extract clean, near-verbatim quotes spoken by AUDIENCE members - students, callers, clients, prospects - in the creator's transcripts. You are NOT extracting the creator's own words. You extract what OTHER people say to her.

Anna runs Q&A calls, coaching calls, and group conversations where students/callers speak. Your job is to surface those moments - the ones where someone other than Anna reveals a struggle they're dealing with or a desire they want to achieve.

CLEANING (very important):
Quotes must preserve the speaker's meaning and voice but be cleaned up for readability:
- Remove filler words: "like", "you know", "so", "I mean", "kind of", "sort of", "uh", "um", "right?", "you see", "I guess".
- Remove false starts and stutters: "I I I think" -> "I think".
- Collapse repeated phrases ("it's just it's just too much" -> "it's just too much").
- Trim sentence-end filler ("...you know what I mean?" -> "..." with the prior sentence intact).
- Keep meaningful intensifiers ("really", "always", "every single time"). Keep emotional words. Keep the speaker's natural sentence structure.
- DO NOT paraphrase or summarise. DO NOT add words that weren't said. The quote should still read as if THAT speaker said it - just without the verbal noise.

For each audience quote you extract:
- text:           the cleaned-up quote (per the rules above).
- speaker_label:  who said it. Use the name if mentioned in transcript ("Sarah", "Maria"). Otherwise use a generic label ("Student", "Caller", "Group member", "Client"). NEVER use "Anna".
- category:       MUST be exactly one of:
                  "struggle" - something they're dealing with, fearing, or stuck on
                  "desire"   - something they want to achieve, build, become, or have
                  "win"      - a positive outcome / result they've already experienced (use this for customer wins, testimonials, transformation moments)
                  Pick whichever fits best - never leave this blank.
- title:          a short headline (8-14 words) that summarises the STRUGGLE / DESIRE / WIN itself, not the person.
                  Rules:
                  - NEVER use the speaker's name or any avatar name. Don't write "Sarah is..." or "Adriana feels...".
                  - Write in the AUDIENCE MEMBER's voice. Use "you", "your", or just the action ("comparing", "wanting", "feeling"). Imagine the audience member naming their own problem.
                  - Stay in the speaker's natural language - if they'd say "creative industries" not "creator economy", use that.
                  - Be specific. Avoid generic words like "challenges" or "struggles" - name the actual thing.
                  - No quotation marks, no trailing punctuation beyond a period if needed.
                  Examples:
                  struggle → "comparing your niche to other creative industries and feeling like it's easier for everyone else"
                  struggle → "starting things and never finishing them"
                  desire   → "wanting to know if you're charging enough without coming across as greedy"
                  desire   → "building a business that doesn't depend on chasing client work"
                  win      → "finally hitting $5K month after years of just-barely-making-it"
- timestamp:      if the transcript has timestamps near the quote, include the closest one in [hh:mm:ss] or [mm:ss] format. Otherwise empty string.

Rules:
- Anna is the host. She speaks much more than anyone else. SKIP her speech entirely.
- Only extract quotes where it is unambiguous that someone other than Anna is speaking. If you cannot tell who is speaking, skip the quote.
- Prefer specific, emotionally rich quotes over generic "thanks Anna" filler.
- Aim for 5-20 quotes per transcript depending on how much audience speech is present. Zero is acceptable if there is no audience speech.
- Return JSON ONLY. No prose outside the JSON.

JSON shape:
{
  "quotes": [
    {
      "text": "I keep starting things and not finishing them.",
      "speaker_label": "Sarah",
      "category": "struggle",
      "title": "starting things and never finishing them",
      "timestamp": "[00:14:22]"
    }
  ]
}`;

function parseClaudeJson(raw: string): { quotes: any[] } {
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch {}
  if (!parsed) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  if (!parsed || !Array.isArray(parsed.quotes)) return { quotes: [] };
  return { quotes: parsed.quotes };
}

export async function extractAudienceQuotesFromTranscript(args: {
  transcriptId: string;
  transcriptFilename: string;
  transcriptText: string;
}): Promise<AudienceQuote[]> {
  const text = args.transcriptText.length > MAX_TRANSCRIPT_CHARS
    ? args.transcriptText.slice(0, MAX_TRANSCRIPT_CHARS)
    : args.transcriptText;

  const userPrompt = [
    `Transcript: ${args.transcriptFilename}`,
    '',
    'Extract verbatim audience quotes per the system prompt. Anna is the host - skip everything SHE says.',
    '',
    '--- TRANSCRIPT ---',
    text,
    '--- END TRANSCRIPT ---',
  ].join('\n');

  const raw = await callBridge(SYSTEM_PROMPT, userPrompt);
  const { quotes } = parseClaudeJson(raw);
  const now = Math.floor(Date.now() / 1000);
  const out: AudienceQuote[] = [];

  for (const item of quotes) {
    const t = String(item?.text ?? '').trim();
    if (!t) continue;
    const category = normalizeCategory(item?.category);
    // Title (the new headline field). Fall back to legacy `context` if a
    // model emits that name out of habit.
    const titleStr = String(item?.title ?? item?.context ?? '').trim();
    out.push({
      id: `aq-${args.transcriptId}-${out.length + 1}-${Math.random().toString(36).slice(2, 8)}`,
      text: t,
      speaker_label: String(item?.speaker_label ?? 'Student').trim() || 'Student',
      category,
      title: titleStr,
      timestamp: String(item?.timestamp ?? '').trim(),
      source_transcript_id: args.transcriptId,
      source_transcript_filename: args.transcriptFilename,
      avatar_id: null,
      status: 'pending',
      created_at: now,
      updated_at: now,
    });
  }

  return out;
}

// ─── Sync audience-quote attachments into the avatar's lists ─────────────
// When Anna attaches a struggle quote to Alyssa, the quote text shows up in
// Alyssa's "what they struggle with" list automatically. Same for desires
// → outcomes. Detach / category change / text edit / delete all reconcile.

const AVATAR_BANK_FILE = abs('00_System', 'offer-results.json');

type AvatarRow = {
  id: string;
  name?: string;
  struggles?: string[];
  outcomes?: string[];
  [k: string]: any;
};

function readAvatarBank(): AvatarRow[] {
  try {
    const arr = JSON.parse(fs.readFileSync(AVATAR_BANK_FILE, 'utf8'));
    if (Array.isArray(arr)) return arr as AvatarRow[];
  } catch {}
  return [];
}

function writeAvatarBank(rows: AvatarRow[]): void {
  fs.mkdirSync(path.dirname(AVATAR_BANK_FILE), { recursive: true });
  fs.writeFileSync(AVATAR_BANK_FILE, JSON.stringify(rows, null, 2));
}

function categoryToAvatarField(cat: AudienceQuoteCategory): 'struggles' | 'outcomes' | null {
  if (cat === 'struggle') return 'struggles';
  if (cat === 'desire') return 'outcomes';
  return null;
}

function upsertAvatarRow(
  rows: AvatarRow[],
  avatarId: string,
  mutate: (row: AvatarRow) => void,
): void {
  let row = rows.find((r) => r.id === avatarId);
  if (!row) {
    // File-only avatars (no bank row yet) get created in place so we can
    // store the attached audience-quote text. Mirrors the lazy-create in
    // the avatars PATCH endpoint.
    const slug = avatarId.startsWith('avatar-') ? avatarId.slice('avatar-'.length) : avatarId;
    row = {
      id: avatarId,
      name: slug,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    };
    rows.unshift(row);
  }
  mutate(row);
  row.updated_at = Math.floor(Date.now() / 1000);
}

function removeFromList(list: string[] | undefined, text: string): string[] {
  if (!Array.isArray(list)) return [];
  return list.filter((s) => s.trim() !== text.trim());
}

function addToList(list: string[] | undefined, text: string): string[] {
  const cur = Array.isArray(list) ? list.slice() : [];
  if (!cur.some((s) => s.trim() === text.trim())) cur.push(text);
  return cur;
}

/**
 * Reconcile avatar lists after an audience-quote PATCH.
 * Removes the OLD (avatar, field) entry if needed; adds the NEW one if
 * avatar + struggle/desire is set.
 */
export function reconcileAvatarLists(prev: AudienceQuote, next: AudienceQuote): void {
  const rows = readAvatarBank();
  const prevField = categoryToAvatarField(prev.category);
  const nextField = categoryToAvatarField(next.category);

  const prevAttached = prev.avatar_id && prevField;
  const nextAttached = next.avatar_id && nextField;

  // Case 1: previously attached but now no longer attached to that avatar +
  // category combination. Remove the OLD text.
  if (prevAttached) {
    const movedAway =
      prev.avatar_id !== next.avatar_id ||
      prev.category !== next.category ||
      prev.text !== next.text; // text-edit also drops the old entry
    if (movedAway) {
      const oldRow = rows.find((r) => r.id === prev.avatar_id);
      if (oldRow) {
        const field = prevField as 'struggles' | 'outcomes';
        oldRow[field] = removeFromList(oldRow[field], prev.text);
      }
    }
  }

  // Case 2: currently attached to an avatar with a sortable category.
  if (nextAttached && next.status !== 'dismissed') {
    upsertAvatarRow(rows, next.avatar_id!, (row) => {
      const field = nextField as 'struggles' | 'outcomes';
      row[field] = addToList(row[field], next.text);
    });
  }

  writeAvatarBank(rows);
}

/**
 * Called when an audience quote is deleted or dismissed. Removes its text
 * from the attached avatar's list (if any).
 */
export function detachQuoteFromAvatar(quote: AudienceQuote): void {
  const field = categoryToAvatarField(quote.category);
  if (!quote.avatar_id || !field) return;
  const rows = readAvatarBank();
  const row = rows.find((r) => r.id === quote.avatar_id);
  if (!row) return;
  row[field] = removeFromList(row[field], quote.text);
  writeAvatarBank(rows);
}

// ─── Push an audience quote to the proof bank ────────────────────────────

const PROOF_BANK_FILE = abs('00_System', 'proof-points.json');

export function pushQuoteToProofBank(quote: AudienceQuote): { id: string } {
  let arr: any[] = [];
  try { arr = JSON.parse(fs.readFileSync(PROOF_BANK_FILE, 'utf8')); } catch {}
  if (!Array.isArray(arr)) arr = [];
  const now = Math.floor(Date.now() / 1000);
  const entry = {
    id: `pc-${now}-${Math.random().toString(36).slice(2, 6)}`,
    text: quote.text,
    // Prefer the new headline-style title; fall back to a speaker+snippet
    // composite if a quote was migrated from the old format with no title.
    title: quote.title || `${quote.speaker_label}: ${quote.text.slice(0, 60)}${quote.text.length > 60 ? '…' : ''}`,
    context: `Quote from ${quote.speaker_label}`,
    source_transcript: quote.source_transcript_filename,
    source_timestamp: quote.timestamp || null,
    source_moments: [],
    tags: [] as string[],
    status: 'confirmed',
    created_at: now,
    updated_at: now,
    audience_quote_id: quote.id,
  };
  arr.push(entry);
  fs.mkdirSync(path.dirname(PROOF_BANK_FILE), { recursive: true });
  fs.writeFileSync(PROOF_BANK_FILE, JSON.stringify(arr, null, 2));
  return { id: entry.id };
}
