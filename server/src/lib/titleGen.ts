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

const RELEVANCE_GATE = `
RELEVANCE GATE. THIS PASSES BEFORE ANYTHING ELSE MATTERS.

Before a viewer can feel a curiosity gap, they have to know the title is about something they care about. If the ideal viewer (from the positioning block above) scrolls past the title and cannot place the topic in under a second, the curiosity never gets a chance to fire. People do not click on things they cannot identify.

A title like "two numbers vs a thousand metrics" opens a gap in the abstract, but it is topic-ambiguous. The viewer cannot tell whether this is about analytics, fitness, finance, business KPIs, or YouTube, so they scroll past, even if they are curious in principle, because the title has not told them this is for them.

The fix is to put a topic anchor in every title. A topic anchor is a noun, domain word, person-type, or concrete object that lets the ideal viewer place the video in under a second. Use the positioning block above to derive what kinds of anchors will land for this creator's audience (the niche, the role, the outcome they care about).

Apply this gate first on every candidate. The test is: would the ideal viewer look at this title in under a second and know what it is about, and that it relates to their work or life? If they would have to read the description to figure it out, the title fails the gate and must be rewritten. No exceptions, no clever-but-vague exceptions.
`.trim();

const CURIOSITY_GAP_PRINCIPLE = `
CURIOSITY GAP IS THE WHOLE JOB (ONCE RELEVANCE IS ESTABLISHED).

Every title formula below is a different mechanism for opening the same thing: a gap between what the viewer already knows and what they want to know. If a title does not open a gap, it does not get the click, regardless of which formula it uses.

There are two specific failure modes you must catch before returning anything.

The first failure mode is that the title states the answer. If the viewer can guess the resolution from the title alone, the click dies. A title like "world's fastest drone tries to keep up with F1 car" telegraphs the ending. The fix is "F1 car vs world's fastest drone", which sets up the tension without resolving it.

The second failure mode is that the gap only opens for the core audience. If a casual viewer in an adjacent space and a brand new viewer with zero context cannot feel the gap, the title will only reach people who already follow the channel.

Use the CCN test on every title before you return it. CCN stands for core, casual, and new. The core audience already cares about the topic. The casual viewer is in the adjacent space but is not subscribed. The new viewer has zero context. A strong title makes all three want to click, and the descriptor usually does the heavy lifting. A category-style descriptor (for example "the Mozart of Gen Z") travels far beyond the core, while a literal name (for example "Jacob Collier") only lands with people who already know who that is.
`.trim();

const TITLE_FORMULAS = `
8 PROVEN TITLE FORMULAS. Cover at least 5 of the 8 across the 10 titles, and include at least one Comparison and at least one Format Lift.

1. Compression: [Large value] in [Small or specific time or effort]
2. Blueprint or Framework: My [System or Blueprint or Framework] for [Specific Result]
3. Identity: [Statement about who the viewer is or what they believe] + [Challenge or transformation]
4. Authority: [Credential or proof point] + [Specific claim]
5. Pattern Interrupt: Unexpected language that creates a mismatch with what the niche expects
6. Curiosity or Open Loop: Hints at a result without giving it away. Brackets can work as a secondary hook
7. Comparison or Step-up: X vs Y, or X vs Y vs Z, where the gap between them creates the tension. Examples include "$25K vs $25M", "5 minutes vs 50 minutes", and "freelancer vs studio vs solo SaaS"
8. Format Lift: Borrow a proven format from an adjacent niche and apply it to this topic. The adjacent niche is the source of the format, and the topic is what you fill it with
`.trim();

const GENERATION_PROCESS = `
GENERATION PROCESS.

Do this work internally before you return anything. The user only sees the final 10 titles, but the funnel underneath them is what makes them strong.

First, generate 30 candidate titles internally, roughly 4 per formula across the 8 formulas. Five of those will be one-word variants of another candidate, and that is the point.

Second, for each candidate, mentally write the most exaggerated, almost-unbelievable version of the title, and then write the dialled-back version next to it. Your final candidate should sit between those two poles, closer to exaggerated than safe.

Third, write the most boring possible version of each candidate, the version a corporate marketing team would ship (the "how LA addresses its water shortage problem" version). Confirm that none of the titles you return are within striking distance of that floor.

Fourth, run every candidate through the relevance gate first. Drop any whose topic the ideal viewer could not place in under a second. Then score the survivors against the CCN test and the promise-not-resolution check. Drop any that fail either one.

Fifth, return the top 5 audience-explicit titles and the top 5 audience-implied titles from the survivors.
`.trim();

function buildSystemPrompt(): string {
  const ctx = loadCreatorContext();
  const voiceBlock = buildVoiceStyleBlock(ctx);
  const intro = ctx.name
    ? `You generate YouTube title and thumbnail options for ${ctx.possessive} channel${ctx.channelHandle ? ` ${ctx.channelHandle}` : ''}.`
    : `You generate YouTube title and thumbnail options for a creator's channel.`;
  return `${intro}

${buildPositioningBlock(ctx)}

${voiceBlock ? voiceBlock + '\n\n' : ''}${RELEVANCE_GATE}

${CURIOSITY_GAP_PRINCIPLE}

${TITLE_FORMULAS}

${GENERATION_PROCESS}

OUTPUT FORMAT - RETURN ONLY VALID JSON, no markdown fences, no prose:
{
  "titles_explicit": [
    {"title": "...", "formula": "Compression | Blueprint | Identity | Authority | Pattern Interrupt | Curiosity | Comparison | Format Lift"}
  ],
  "titles_implied": [
    {"title": "...", "formula": "..."}
  ],
  "thumbnail_phrases": [
    {"phrase": "3-5 word phrase", "gap": "result | proof | contrarian"}
  ]
}

Return exactly 5 titles_explicit (audience named directly, for example "for freelancers"), 5 titles_implied (audience signalled by descriptor or topic frame, never by a literal callout), and 5 thumbnail_phrases.

CRITICAL:
- Titles must be lowercase
- No emojis
- Across the 10 titles, cover at least 5 of the 8 formulas, and include at least one Comparison and at least one Format Lift
- Titles 1-5 must explicitly name the audience
- Titles 6-10 must NOT name the audience, and should lead with a descriptor or topic frame that travels beyond the core
- Every title must pass the relevance gate, meaning the ideal viewer can place the topic in under a second without reading the description (no topic-ambiguous "two numbers vs a thousand metrics" style titles)
- Every title must pass the CCN test, meaning the core, casual, and new viewer can all feel the gap
- Every title must pass the promise-not-resolution check, meaning the title sets up tension but does not give away the ending
- Thumbnail phrases must communicate something the title doesn't
- Max 1 word in ALL CAPS per thumbnail phrase
- Match the voice style above exactly
- NO em dashes (U+2014) anywhere, plain hyphens only`;
}

export type SuggestionItem = { title?: string; phrase?: string; formula?: string; gap?: string; liked?: boolean; edited?: boolean };
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

  const explicitEditedPlain = explicitLocked.filter((x) => !x.edited);
  const impliedEditedPlain = impliedLocked.filter((x) => !x.edited);
  const phrasesEditedPlain = phrasesLocked.filter((x) => !x.edited);
  const explicitEdited = explicitLocked.filter((x) => x.edited);
  const impliedEdited = impliedLocked.filter((x) => x.edited);
  const phrasesEdited = phrasesLocked.filter((x) => x.edited);

  const hasAnyLocked = explicitLocked.length + impliedLocked.length + phrasesLocked.length > 0;
  const hasAnyEdited = explicitEdited.length + impliedEdited.length + phrasesEdited.length > 0;
  const hasAnyPlainLocked = explicitEditedPlain.length + impliedEditedPlain.length + phrasesEditedPlain.length > 0;

  const lockedBlock = hasAnyPlainLocked
    ? `
ALREADY LOCKED (the user liked these as-is - your job is to generate the rest. Do NOT repeat these. Generate COMPLEMENTARY options that cover different formulas and angles than the locked ones):

Audience-called-out (locked):
${lockedSummary(explicitEditedPlain, 'title')}

Audience-implied (locked):
${lockedSummary(impliedEditedPlain, 'title')}

Thumbnail phrases (locked):
${lockedSummary(phrasesEditedPlain, 'phrase')}
`
    : '';

  const editedBlock = hasAnyEdited
    ? `
USER-EDITED DIRECTION HINTS (the user reshaped these titles by hand - they are telling you what direction they want. Keep these slots verbatim, and let the wording, register, and angle of these shape the new titles you generate. Do not contradict the choices the user made here):

Audience-called-out (user-edited):
${lockedSummary(explicitEdited, 'title')}

Audience-implied (user-edited):
${lockedSummary(impliedEdited, 'title')}

Thumbnail phrases (user-edited):
${lockedSummary(phrasesEdited, 'phrase')}
`
    : '';

  const slotsBlock = hasAnyLocked
    ? `\nYou must return ${explicitNeeded} new audience-explicit titles, ${impliedNeeded} new audience-implied titles, and ${phrasesNeeded} new thumbnail phrases to fill the remaining slots.`
    : '';

  const userContent = `
Generate title + thumbnail options for this video.

CURRENT WORKING TITLE: ${params.videoTitle}

CTA: ${params.cta ?? '(no CTA configured - set one in Settings)'}

SCRIPT / NOTES (use this to ground titles in what the video actually delivers):
${(params.scriptContent ?? '').slice(0, 12000)}
${lockedBlock}${editedBlock}${slotsBlock}

Return JSON only. titles_explicit and titles_implied arrays should contain ONLY the NEW options (do not repeat any locked or user-edited titles - those slots are already filled and will be merged in client-side). Same for thumbnail_phrases.
`.trim();

  const raw = (await callBridge(buildSystemPrompt(), userContent)).trim();
  const parsed = parseModelJson(raw);
  const validTitle = (x: any) => x && typeof x.title === 'string' && x.title.trim().length > 0;
  const validPhrase = (x: any) => x && typeof x.phrase === 'string' && x.phrase.trim().length > 0;

  const newExplicit = (Array.isArray(parsed.titles_explicit) ? parsed.titles_explicit : [])
    .filter(validTitle)
    .map((x: any) => ({ ...x, liked: false, edited: false }));
  const newImplied = (Array.isArray(parsed.titles_implied) ? parsed.titles_implied : [])
    .filter(validTitle)
    .map((x: any) => ({ ...x, liked: false, edited: false }));
  const newPhrases = (Array.isArray(parsed.thumbnail_phrases) ? parsed.thumbnail_phrases : [])
    .filter(validPhrase)
    .map((x: any) => ({ ...x, liked: false, edited: false }));

  return {
    titles_explicit: [...explicitLocked, ...newExplicit].slice(0, 5),
    titles_implied: [...impliedLocked, ...newImplied].slice(0, 5),
    thumbnail_phrases: [...phrasesLocked, ...newPhrases].slice(0, 5),
    generated_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Robust JSON parser for LLM output. Handles the common failure modes the
 * model produces: markdown fences, trailing commas, unquoted keys, single
 * quotes around strings, and prefix or suffix prose. Logs the raw output on
 * failure so we can see what came back if everything fails.
 */
function parseModelJson(raw: string): any {
  const attempts: string[] = [];

  let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  attempts.push(cleaned);

  const outer = cleaned.match(/\{[\s\S]*\}/);
  if (outer) attempts.push(outer[0]);

  const quoteKeys = (s: string) => s.replace(/([{,]\s*)([a-zA-Z_][\w]*)\s*:/g, '$1"$2":');
  attempts.push(quoteKeys(cleaned));
  if (outer) attempts.push(quoteKeys(outer[0]));

  const singleToDouble = (s: string) => s.replace(/'([^'\\]*)'/g, '"$1"');
  attempts.push(singleToDouble(cleaned));
  if (outer) attempts.push(singleToDouble(quoteKeys(outer[0])));

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // try the next attempt
    }
  }

  console.error('[titleGen] all parse attempts failed. raw model output:');
  console.error(raw);
  throw new Error(`could not parse json from response (length ${raw.length}). check server logs for the raw output.`);
}
