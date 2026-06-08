/**
 * YouTube description generator — calls the local claude-bridge with the
 * youtube-description skill's structure: CTA + 2-sentence hook + 4-6
 * timestamped chapters from the transcript.
 *
 * Mirrors the skill at:
 *   Product - Solopreneur OS/.claude/skills/youtube-description/SKILL.md
 *
 * NOT mirrored here (skipped intentionally):
 *   - Tracking slug minting + link_manifest update. That requires a Cloudflare
 *     worker side-effect. We use focus_cta_url directly. Can layer that on
 *     later if Anna wants per-video click attribution from the dashboard.
 */

import { abs, loadFile } from '../vault.js';

const BRIDGE_URL = 'http://localhost:8788/run';
const VOICE_FILE_REL = ['01_Core', 'core_voice-style.md'] as const;

export type GenerateDescriptionInput = {
  videoTitle: string;
  scriptContent: string;
  ctaText: string;
  ctaUrl: string;
};

export type GeneratedDescription = {
  description: string; // ready-to-paste full description (CTA + hook + chapters)
  generated_at: number;
};

function stripEmDashes(s: string): string {
  return s.replace(/—/g, ' - ').replace(/–/g, '-');
}

function getVoiceSummary(): string {
  // Send the first ~3000 chars of the voice guide so the model can calibrate.
  // Same slice the IG caption generator uses; full file is too long for
  // every prompt.
  try {
    const entry = loadFile(abs(...VOICE_FILE_REL));
    return (entry?.body ?? '').slice(0, 3000);
  } catch {
    return '';
  }
}

const DESCRIPTION_SYSTEM = `You write YouTube descriptions in the creator's voice for the channel.

NON-NEGOTIABLES:
- NEVER use the em dash character (—). Use a plain hyphen with spaces ( - ) instead. Zero exceptions.
- No emojis anywhere.
- No hashtags. Never. YouTube descriptions don't use hashtags.
- No guru language. No hype. No "here's the truth nobody talks about."
- Sound natural, direct, like Anna wrote it herself. Short to medium sentences.
- Use ONLY content from the transcript. Do not invent claims, results, or stories.

STRUCTURE (in this exact order):

1) CTA LINE (1 line). Use the provided CTA text VERBATIM, exactly as given, followed by " -> " (arrow) and the link. Do not paraphrase the CTA. Example shape:
   <cta text> -> <cta url>

2) BLANK LINE.

3) HOOK PARAGRAPH (exactly 2 sentences, each on its own line, blank line between them).
   Sentence 1: "In this video, I share [the specific thing/framework/system] that helped me [specific result from the transcript]." OR "In this video, I share [the specific thing] that's going to help you [specific outcome]." Pick whichever framing is stronger for this video.
   Sentence 2: "Built for [specific person] who [specific situation]." OR "If you're [specific situation], this gives you [specific path/outcome]." Be direct. Name the audience. Name the problem.
   Include the primary keyword naturally in sentence 1 or 2 (one natural inclusion, no keyword stuffing).

4) BLANK LINE.

5) The literal line: "What we cover:"

6) 4-6 CHAPTERS. Each on its own line. Format: "<timestamp> - <chapter title>" where timestamp is mm:ss (or h:mm:ss) extracted from the transcript. First chapter is ALWAYS "0:00 - Intro" (or whatever name matches what the intro is actually about). Chapter titles: AS FEW WORDS AS POSSIBLE. Curiosity over explanation. Clarity over cleverness. Match what Anna actually says, not marketing language. Example strong titles: "The 5-step framework", "What I'd skip if I started over". Example weak titles to avoid: "How to use the 5-step framework to write your first script", "Tips and tricks".

If timestamps are not present in the transcript, write chapter titles only (no timestamps) and at the very end append a single italics line: "_note: add timestamps manually before publishing._"

OUTPUT FORMAT — return a JSON object only, no commentary, no markdown fences:
{
  "description": "the FULL description ready to paste, including CTA line, blank line, hook sentence 1, blank line, hook sentence 2, blank line, the 'What we cover:' line, then each chapter on its own line"
}`;

async function callBridge(system: string, user: string, maxTokens = 2500): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4 * 60 * 1000);
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'videoDescription',
        system,
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
      throw new Error('description generation timed out after 4 minutes. try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function parseDescription(raw: string): { description: string } {
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('could not parse json from response');
    parsed = JSON.parse(match[0]);
  }
  const description = stripEmDashes(String(parsed.description ?? '').trim());
  if (!description) throw new Error('empty description from model');
  return { description };
}

export async function generateVideoDescription(input: GenerateDescriptionInput): Promise<GeneratedDescription> {
  const voice = getVoiceSummary();
  const userPrompt = [
    `# Finalised title`,
    input.videoTitle,
    `\n# CTA line (use verbatim, do not paraphrase)`,
    input.ctaText,
    `\n# CTA link (use exactly)`,
    input.ctaUrl,
    `\n# Transcript`,
    input.scriptContent,
    voice ? `\n# the creator's voice (calibrate to this)\n${voice}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await callBridge(DESCRIPTION_SYSTEM, userPrompt);
  const parsed = parseDescription(raw);
  return {
    description: parsed.description,
    generated_at: Math.floor(Date.now() / 1000),
  };
}
