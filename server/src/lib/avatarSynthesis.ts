/**
 * Claude synthesises an avatar's profile fields from the audience quotes
 * the creator has attached to them. Produces concise, in-voice bullets for the
 * before/struggles/after/outcomes fields - not generic corporate-speak.
 *
 * Input:
 *   - The avatar's current profile (read-only context)
 *   - All audience quotes attached to this avatar (struggle / desire / win)
 *
 * Output: { before_state, struggles[], after_state, outcomes[] }
 */

import type { AudienceQuote } from './audienceQuotes.js';

import { BRIDGE_URL } from './bridge.js';

export type SynthesisResult = {
  before_state: string;
  struggles: string[];
  after_state: string;
  outcomes: string[];
};

type AvatarContext = {
  name?: string | null;
  before_state?: string | null;
  after_state?: string | null;
  struggles?: string[];
  outcomes?: string[];
};

async function callBridge(system: string, user: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3 * 60 * 1000);
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'avatarSynthesis', system, user, maxTokens: 4000, expectJson: true }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`claude-bridge ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error) throw new Error(`claude-bridge: ${data.error}`);
    if (!data.text) throw new Error('claude-bridge: no text in response');
    return data.text;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('avatar synthesis timed out after 3 minutes.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

const SYSTEM_PROMPT = `You synthesise an avatar profile from real quotes spoken by this avatar in transcripts. The avatar is the creator's ideal customer - a real human the creator serves.

You will receive:
- The avatar's current profile (name, before/after state, existing bullets).
- A list of audience quotes - each has a title (1-line headline summarising what the moment is about), the verbatim quote text, and a category (struggle / desire / win).

Your job: synthesise concise, punchy, IN-HER-VOICE bullets that REPLACE the current bullets. These become the displayed avatar profile.

OUTPUT FOUR FIELDS:

1. before_state: A short descriptive paragraph (2-4 sentences) of her current daily reality. Written in close-third person ("She wakes up..."). Use her natural language from the quotes - do not translate into business-speak.

2. struggles: 4-6 short punchy bullets naming what she is stuck on, dealing with, fearing. Each bullet 8-18 words. Use her actual phrasing where you can.

3. after_state: A short descriptive paragraph (2-4 sentences) of her desired daily reality. Same close-third tone.

4. outcomes: 4-6 short punchy bullets naming what she wants / aspires to. Each bullet 8-18 words.

RULES:
- Stay in HER voice. Borrow her phrases from the quotes wherever possible.
- Be specific. Avoid generic words ("challenges", "growth", "success").
- Never use her name inside the bullets - just "she" or imperative phrasing.
- Never use corporate-speak ("scale your business", "leverage", "drive results", "monetise").
- If there aren't enough quotes for a category, reduce bullet count - do NOT fabricate.
- If the avatar has zero struggle / desire / win quotes, return an empty array for that section.

Return JSON ONLY. No prose outside the JSON.

JSON shape:
{
  "before_state": "...",
  "struggles": ["...", "..."],
  "after_state": "...",
  "outcomes": ["...", "..."]
}`;

function parseClaudeJson(raw: string): SynthesisResult {
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch {}
  if (!parsed) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  if (!parsed) {
    return { before_state: '', struggles: [], after_state: '', outcomes: [] };
  }
  return {
    before_state: typeof parsed.before_state === 'string' ? parsed.before_state.trim() : '',
    after_state: typeof parsed.after_state === 'string' ? parsed.after_state.trim() : '',
    struggles: Array.isArray(parsed.struggles)
      ? parsed.struggles.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => s.trim())
      : [],
    outcomes: Array.isArray(parsed.outcomes)
      ? parsed.outcomes.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => s.trim())
      : [],
  };
}

export async function synthesiseAvatarFromQuotes(
  avatar: AvatarContext,
  quotes: AudienceQuote[],
): Promise<SynthesisResult> {
  const grouped: Record<'struggle' | 'desire' | 'win', AudienceQuote[]> = {
    struggle: quotes.filter((q) => q.category === 'struggle'),
    desire: quotes.filter((q) => q.category === 'desire'),
    win: quotes.filter((q) => q.category === 'win'),
  };

  const ctxLines: string[] = [
    `AVATAR NAME: ${avatar.name ?? '(unnamed)'}`,
    '',
    `CURRENT BEFORE STATE: ${avatar.before_state ?? '(empty)'}`,
    `CURRENT AFTER STATE: ${avatar.after_state ?? '(empty)'}`,
    `CURRENT STRUGGLES BULLETS: ${avatar.struggles?.join(' | ') || '(empty)'}`,
    `CURRENT OUTCOMES BULLETS: ${avatar.outcomes?.join(' | ') || '(empty)'}`,
    '',
    '--- ATTACHED AUDIENCE QUOTES ---',
  ];
  for (const cat of ['struggle', 'desire', 'win'] as const) {
    const list = grouped[cat];
    if (list.length === 0) continue;
    ctxLines.push('');
    ctxLines.push(`# ${cat.toUpperCase()} (${list.length})`);
    for (const q of list) {
      ctxLines.push(`- [${q.speaker_label}${q.timestamp ? ' ' + q.timestamp : ''}]`);
      if (q.title) ctxLines.push(`  title: ${q.title}`);
      ctxLines.push(`  quote: "${q.text}"`);
    }
  }

  const user = ctxLines.join('\n');
  const text = await callBridge(SYSTEM_PROMPT, user);
  return parseClaudeJson(text);
}
