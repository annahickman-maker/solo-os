/**
 * YouTube title + thumbnail-phrase generator.
 *
 * Calls the local claude-bridge so titles are generated using your Claude Code
 * subscription instead of metered API spend.
 *
 * Channel positioning + voice style are pulled from the vault via
 * loadCreatorContext() - every title set adapts to whoever's onboarded.
 */

import { loadCreatorContext, buildPositioningBlock, buildVoiceStyleBlock } from './creatorContext.js';

import { BRIDGE_URL } from './bridge.js';

const TITLE_FORMULAS = `
6 PROVEN TITLE FORMULAS (cover at least 4 across the 10 titles):

1. Compression: [Large value] in [Small/specific time or effort]
2. Blueprint/Framework: My [System/Blueprint/Framework] for [Specific Result]
3. Identity: [Statement about who the viewer is or what they believe] + [Challenge or transformation]
4. Authority: [Credential or proof point] + [Specific claim]
5. Pattern Interrupt: Unexpected language that creates mismatch with niche expectations.
6. Curiosity/Open Loop: Hints at result without giving it away. Brackets work well as secondary hook.
`.trim();

function buildSystemPrompt(): string {
  const ctx = loadCreatorContext();
  const voiceBlock = buildVoiceStyleBlock(ctx);
  const intro = ctx.name
    ? `You generate YouTube title and thumbnail options for ${ctx.possessive} channel${ctx.channelHandle ? ` ${ctx.channelHandle}` : ''}.`
    : `You generate YouTube title and thumbnail options for a creator's channel.`;
  return `${intro}

${buildPositioningBlock(ctx)}

${voiceBlock ? voiceBlock + '\n\n' : ''}${TITLE_FORMULAS}

OUTPUT FORMAT - RETURN ONLY VALID JSON, no markdown fences, no prose:
{
  "titles_explicit": [
    {"title": "...", "formula": "Compression | Blueprint | Identity | Authority | Pattern Interrupt | Curiosity"}
  ],
  "titles_implied": [
    {"title": "...", "formula": "..."}
  ],
  "thumbnail_phrases": [
    {"phrase": "3-5 word phrase", "gap": "result | proof | contrarian"}
  ]
}

Return exactly 5 titles_explicit (audience named directly e.g. "for freelancers"), 5 titles_implied (audience implied by topic), and 5 thumbnail_phrases.

CRITICAL:
- Titles must be lowercase
- No emojis
- Across 10 titles, cover at least 4 of the 6 formulas
- Titles 1-5 must explicitly name the audience
- Titles 6-10 must NOT name the audience
- Thumbnail phrases must communicate something the title doesn't
- Max 1 word in ALL CAPS per thumbnail phrase
- Match the voice style above exactly
- NO em dashes (U+2014) anywhere - plain hyphens only`;
}

export type SuggestionItem = { title?: string; phrase?: string; formula?: string; gap?: string; liked?: boolean };
export type Suggestions = {
  titles_explicit: SuggestionItem[];
  titles_implied: SuggestionItem[];
  thumbnail_phrases: SuggestionItem[];
  generated_at: number;
};

function lockedSummary(items: SuggestionItem[], kind: 'title' | 'phrase'): string {
  const locked = items.filter((x) => x.liked);
  if (locked.length === 0) return 'none locked yet';
  return locked.map((x, i) => `  ${i + 1}. ${kind === 'title' ? x.title : x.phrase}${x.formula ? ` [${x.formula}]` : ''}`).join('\n');
}

async function callBridge(system: string, user: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4 * 60 * 1000);
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'titleGen', system, user, maxTokens: 4000, expectJson: true }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`claude-bridge ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error) throw new Error(`claude-bridge: ${data.error}`);
    if (!data.text) throw new Error('claude-bridge: no text in response');
    return data.text;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('title generation timed out after 4 minutes. try again, or kill stuck claude processes and retry.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateTitles(params: {
  videoTitle: string;
  scriptContent?: string;
  cta?: string | null;
  existing?: Suggestions | null;
}): Promise<Suggestions> {
  const existing = params.existing;
  const explicitLocked = existing?.titles_explicit.filter((x) => x.liked) ?? [];
  const impliedLocked = existing?.titles_implied.filter((x) => x.liked) ?? [];
  const phrasesLocked = existing?.thumbnail_phrases.filter((x) => x.liked) ?? [];
  const explicitNeeded = Math.max(0, 5 - explicitLocked.length);
  const impliedNeeded = Math.max(0, 5 - impliedLocked.length);
  const phrasesNeeded = Math.max(0, 5 - phrasesLocked.length);

  const hasAnyLocked = explicitLocked.length + impliedLocked.length + phrasesLocked.length > 0;

  const lockedBlock = hasAnyLocked
    ? `
ALREADY LOCKED (the user liked these - your job is to generate the rest. Do NOT repeat these. Generate COMPLEMENTARY options that cover different formulas/angles than the locked ones):

Audience-called-out (locked):
${lockedSummary(explicitLocked, 'title')}

Audience-implied (locked):
${lockedSummary(impliedLocked, 'title')}

Thumbnail phrases (locked):
${lockedSummary(phrasesLocked, 'phrase')}

You must return ${explicitNeeded} new audience-explicit titles, ${impliedNeeded} new audience-implied titles, and ${phrasesNeeded} new thumbnail phrases.`
    : '';

  const userContent = `
Generate title + thumbnail options for this video.

CURRENT WORKING TITLE: ${params.videoTitle}

CTA: ${params.cta ?? '(no CTA configured - set one in Settings)'}

SCRIPT / NOTES (use this to ground titles in what the video actually delivers):
${(params.scriptContent ?? '').slice(0, 12000)}
${lockedBlock}

Return JSON only. titles_explicit and titles_implied arrays should contain ONLY the NEW non-locked options. Same for thumbnail_phrases.
`.trim();

  const raw = (await callBridge(buildSystemPrompt(), userContent)).trim();
  let cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('could not parse json from response');
    parsed = JSON.parse(match[0]);
  }
  const newExplicit = (Array.isArray(parsed.titles_explicit) ? parsed.titles_explicit : []).map((x: any) => ({ ...x, liked: false }));
  const newImplied = (Array.isArray(parsed.titles_implied) ? parsed.titles_implied : []).map((x: any) => ({ ...x, liked: false }));
  const newPhrases = (Array.isArray(parsed.thumbnail_phrases) ? parsed.thumbnail_phrases : []).map((x: any) => ({ ...x, liked: false }));

  return {
    titles_explicit: [...explicitLocked, ...newExplicit].slice(0, 5),
    titles_implied: [...impliedLocked, ...newImplied].slice(0, 5),
    thumbnail_phrases: [...phrasesLocked, ...newPhrases].slice(0, 5),
    generated_at: Math.floor(Date.now() / 1000),
  };
}
