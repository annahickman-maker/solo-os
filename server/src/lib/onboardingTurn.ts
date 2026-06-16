/**
 * Onboarding turn processor - the core of Block A.
 *
 * Each turn of the conversational onboarding produces THREE outputs in one
 * Claude call:
 *
 *   Layer 0 - verbatim: the user's answer with light cleanup (filler words +
 *     restarts removed, voice + phrasing + names + numbers preserved).
 *
 *   Layer 2 - tagged atoms: the same answer chunked + tagged
 *     (value / authority / pov / connection / story / proof /
 *     audience-description / offer-detail) and routed to the matching
 *     vault store.
 *
 *   Layer 1 - core file section: a polished prose section update for the
 *     corresponding core_*.md file, ready to write back via the heading-
 *     anchored writer.
 *
 * The three layers leave the turn in sync, all at full quality. This is the
 * upgrade over the "extract everything from completed core files" path in
 * extractFromCore.ts, which loses Layer 0 entirely.
 *
 * This file is the backend foundation. The frontend interview UI consumes
 * this via the POST /api/onboarding/turn endpoint and orchestrates the
 * multi-turn flow.
 */

import { BRIDGE_URL } from './bridge.js';

export type OnboardingTag =
  | 'value'
  | 'authority'
  | 'pov'
  | 'connection'
  | 'story'
  | 'proof'
  | 'audience-description'
  | 'offer-detail';

export type TaggedChunk = {
  text: string;
  tag: OnboardingTag;
  context: string;
  target_store: string; // human-readable target, e.g. "05_Assets/POVs/asset_pov-<slug>.md"
};

export type CorePhase =
  | 'positioning'
  | 'audience'
  | 'my-story'
  | 'ip'
  | 'offer-suite'
  | 'voice-style';

export type OnboardingTurnInput = {
  phase: CorePhase;
  question: string;
  answer: string;
  /** Optional running draft of the relevant core file section, so Claude can iterate on it. */
  current_layer1_section?: string;
};

export type OnboardingTurnOutput = {
  layer0_verbatim: string;
  layer2_chunks: TaggedChunk[];
  layer1_section_md: string;
  /** Plain-language summary of what was captured this turn, for the UI ack. */
  turn_summary: string;
};

const PROCESS_PROMPT = `You are running one turn of a conversational onboarding interview for a creator setting up their business operating system. The user has answered a question for the {{phase}} phase of their foundation. You will return ONE JSON object that captures the answer at three layers simultaneously.

The three layers:

1. layer0_verbatim - the user's answer, lightly cleaned. Remove obvious filler words ("um", "like", "kind of", "you know") and merge restarts ("I was going to - I mean I tried"). PRESERVE voice, phrasing, specifics, names, numbers, dates. This goes to a transcript file the creator can mine later. Do NOT polish or rewrite - this is meant to read like a clean transcript of what they actually said.

2. layer2_chunks - chunk the answer by what kind of content each chunk is, and tag each chunk:
   - "value": a teaching / lesson / framework they want to share
   - "authority": a concrete result with a number/dollar/timeframe (their own or a student's)
   - "pov": a contrarian belief or "not X but Y" stance
   - "connection": a vulnerable / lived-experience / "me too" moment
   - "story": a specific moment with date/place/event
   - "proof": named subject + specific outcome (a client name + result)
   - "audience-description": something they said about WHO they help / who their avatar is
   - "offer-detail": something they said about their offer (name, price, promise, tier)
   Each chunk is a self-contained quote from the verbatim cleaned answer. Each chunk's "context" is a 1-sentence note on what triggered the moment.

3. layer1_section_md - polished prose for the matching section of the core_*.md file. This should be high-quality, cohesive writing in the creator's voice that incorporates THIS answer (and the running draft if provided). It will be written into the core file by a heading-anchored writer. Match the tone of cohesive prose in a foundation document - clear, direct, no filler.

Return ONLY valid JSON in this shape:

{
  "layer0_verbatim": "the cleaned-up answer text, preserving voice",
  "layer2_chunks": [
    {
      "text": "exact quote from the verbatim",
      "tag": "value" | "authority" | "pov" | "connection" | "story" | "proof" | "audience-description" | "offer-detail",
      "context": "1-sentence note on what's happening in this moment",
      "target_store": "human-readable path like '05_Assets/POVs/' or '00_System/journey-timeline.json'"
    }
  ],
  "layer1_section_md": "polished prose for the core file section, in the creator's voice",
  "turn_summary": "1-2 sentence plain-English ack for the user about what got captured"
}

Rules:
- No em dashes. Use hyphens.
- If the answer doesn't yield ANY of a category, return an empty layer2_chunks array.
- layer1_section_md is mandatory - even a short answer should produce SOME polished prose for the section.
- If the user's answer is meta ("I don't know", "skip this one"), return an empty layer2_chunks and a layer1_section_md that's just the current draft (or empty if no draft).`;

async function callBridge(system: string, user: string): Promise<string> {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'onboardingTurn', system, user, maxTokens: 4000, expectJson: true }),
  });
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { text?: string; error?: string };
  if (data.error) throw new Error(data.error);
  if (!data.text) throw new Error('bridge returned no text');
  return data.text;
}

function parseJson(raw: string): any {
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('could not parse onboarding turn JSON');
    return JSON.parse(m[0]);
  }
}

function clean(s: string): string {
  return s.replace(/—/g, '-').replace(/–/g, '-').trim();
}

const VALID_TAGS = new Set<OnboardingTag>([
  'value',
  'authority',
  'pov',
  'connection',
  'story',
  'proof',
  'audience-description',
  'offer-detail',
]);

export async function processOnboardingTurn(input: OnboardingTurnInput): Promise<OnboardingTurnOutput> {
  const system = PROCESS_PROMPT.replace('{{phase}}', input.phase);
  const user = [
    `## phase\n${input.phase}`,
    `## question\n${input.question}`,
    `## answer\n${input.answer}`,
    input.current_layer1_section ? `## current_layer1_draft\n${input.current_layer1_section}` : '',
    '',
    'Process this turn and return the JSON now.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const raw = await callBridge(system, user);
  const parsed = parseJson(raw);

  const layer0 = typeof parsed.layer0_verbatim === 'string' ? clean(parsed.layer0_verbatim) : clean(input.answer);
  const chunksRaw = Array.isArray(parsed.layer2_chunks) ? parsed.layer2_chunks : [];
  const chunks: TaggedChunk[] = chunksRaw
    .filter((c: any) => c && typeof c.text === 'string' && typeof c.tag === 'string' && VALID_TAGS.has(c.tag as OnboardingTag))
    .map((c: any) => ({
      text: clean(c.text),
      tag: c.tag as OnboardingTag,
      context: typeof c.context === 'string' ? clean(c.context) : '',
      target_store: typeof c.target_store === 'string' ? c.target_store : '',
    }));

  return {
    layer0_verbatim: layer0,
    layer2_chunks: chunks,
    layer1_section_md: typeof parsed.layer1_section_md === 'string' ? clean(parsed.layer1_section_md) : '',
    turn_summary: typeof parsed.turn_summary === 'string' ? clean(parsed.turn_summary) : '',
  };
}

// ─── Layer 0 writer: append a verbatim turn to onboarding transcript ────────
// Each onboarding session writes to a single file under
// 05_Assets/Transcripts/onboarding/. The creator can mine these turns later
// using the same extractQuotes pipeline that runs on Q&A transcripts.

import fs from 'node:fs';
import { abs } from '../vault.js';

export function writeOnboardingTurnVerbatim(
  sessionId: string,
  phase: CorePhase,
  question: string,
  verbatim: string,
): { path: string } {
  const dir = abs('05_Assets', 'Transcripts', 'onboarding');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = `${dir}/${sessionId}.md`;

  const block = [
    `## ${phase}`,
    `**Q:** ${question}`,
    '',
    verbatim,
    '',
    '---',
    '',
  ].join('\n');

  if (fs.existsSync(filePath)) {
    fs.appendFileSync(filePath, '\n' + block, 'utf8');
  } else {
    const header = [
      '---',
      'type: onboarding-transcript',
      `session_id: ${sessionId}`,
      `created: '${new Date().toISOString()}'`,
      '---',
      '',
      `# Onboarding session ${sessionId}`,
      '',
      'Lightly-cleaned verbatim answers from the conversational onboarding flow.',
      'Each section corresponds to one turn of the interview.',
      '',
      '---',
      '',
    ].join('\n');
    fs.writeFileSync(filePath, header + block, 'utf8');
  }

  return { path: `05_Assets/Transcripts/onboarding/${sessionId}.md` };
}
