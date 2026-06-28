/**
 * Derive the 5 intro parts (clarity / baseline belief / contrarian / proof /
 * outcome) FROM an already-drafted full script. the creator struggles with intros
 * cold, but the rest of the script gives plenty of context to riff off.
 *
 * The intro section in the script builder uses these 5 parts as separate
 * fields, and `youtubeScriptBuilder.ts` weaves them in when drafting the
 * intro section, so output here matches that shape exactly.
 *
 * Mirrors the youtube-script-intro skill's 3 Cs framework. Voice file is
 * sliced in so the wording sounds like the creator, not a generic template.
 */

import { abs, loadFile } from '../vault.js';

import { BRIDGE_URL } from './bridge.js';
const VOICE_FILE_REL = ['01_Core', 'core_voice-style.md'] as const;

export type IntroParts = {
  clarity: string;
  belief: string;
  contrarian: string;
  proof: string;
  outcome: string;
};

// One section's brief + the bodies of the bank items it anchors. Lets the
// intro generator riff off the user's stated INTENT for each section even
// when the full prose script body is empty.
export type SectionContext = {
  label: string;        // "Intro" / "Context" / "Value point 1" / etc.
  kind: string;         // 'intro' | 'context' | 'value' | 'cta' | 'outro'
  brief: string;        // the user's brief / notes for this section
  anchorTexts: string[]; // the actual story text from each linked bank item
};

export type SuggestIntroInput = {
  videoTitle: string;
  videoGoal: string | null;
  scriptContent: string;
  sections: SectionContext[];
};

function stripEmDashes(s: string): string {
  return s.replace(/-/g, ' - ').replace(/–/g, '-');
}

function getVoiceSummary(): string {
  try {
    const entry = loadFile(abs(...VOICE_FILE_REL));
    return (entry?.body ?? '').slice(0, 3000);
  } catch {
    return '';
  }
}

const INTRO_SYSTEM = `You write the spoken-intro brief for a YouTube video in the creator's voice for the channel.

You get one or more of: the drafted full script body, the per-section briefs (what the creator intends each section to do), and the actual story text of every bank item she's already linked to a section. Use everything you have. If the full script body is thin, lean on the section briefs and anchor stories - they're the source of truth for what the video is going to be.

Your job is to write the 5 brief pieces that, when woven together by the next pass, become a 30-90 second spoken intro that hits the 3 Cs (Clarity, Credibility, Curiosity) in the first 30 seconds.

The 5 PARTS (each is 1-2 sentences MAX, written as if the creator will say them):

1. CLARITY (clarity): what this video is about + what the viewer will be able to do by the end. Names the audience and the outcome. Pulled directly from the script's content.

2. BASELINE BELIEF (belief): the dominant belief or objection most viewers hold on this topic. Phrase it as what "most people" or "everyone else" thinks. This sets up the flip.

3. CONTRARIAN (contrarian): the creator's actual position - the unique take that flips the baseline belief. This is the hook. Must be a real contrarian angle the script actually argues, not a generic reversal.

4. PROOF (proof): one specific, concrete proof point from the script (a result, a number, a named experience). Never invent - if no proof is in the script, write "no proof point in script - add one before filming."

5. OUTCOME (outcome): the tangible thing the viewer walks away ABLE TO DO. NOT a restatement of clarity. Clarity = what the video IS; outcome = what the viewer will be CAPABLE OF after.

NON-NEGOTIABLES:
- NEVER use em dashes. Use plain hyphens.
- No greeting, no "hey guys", no "welcome back".
- Talk to one person, never "you guys".
- No invented proof. Only proof grounded in what's actually in the script.
- Match the creator's voice from the voice file - no hype, no guru language, conversational.

OUTPUT FORMAT - return ONLY a JSON object, no commentary, no markdown fences:
{
  "clarity": "...",
  "belief": "...",
  "contrarian": "...",
  "proof": "...",
  "outcome": "..."
}`;

async function callBridge(system: string, user: string, maxTokens = 2000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4 * 60 * 1000);
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'introFromScript',
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
      throw new Error('intro generation timed out after 4 minutes. try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function parseParts(raw: string): IntroParts {
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('could not parse json from intro response');
    parsed = JSON.parse(match[0]);
  }
  const pick = (k: string) => stripEmDashes(String(parsed[k] ?? '').trim());
  const parts: IntroParts = {
    clarity: pick('clarity'),
    belief: pick('belief'),
    contrarian: pick('contrarian'),
    proof: pick('proof'),
    outcome: pick('outcome'),
  };
  if (!parts.clarity && !parts.belief && !parts.contrarian) {
    throw new Error('empty intro parts from model');
  }
  return parts;
}

function formatSections(sections: SectionContext[]): string {
  if (sections.length === 0) return '';
  const blocks = sections.map((s) => {
    const lines: string[] = [`## ${s.label} (${s.kind})`];
    if (s.brief.trim()) lines.push(`brief: ${s.brief.trim()}`);
    if (s.anchorTexts.length > 0) {
      lines.push('linked stories:');
      for (const t of s.anchorTexts) {
        const snippet = t.length > 600 ? t.slice(0, 600).trim() + '…' : t.trim();
        lines.push(`- ${snippet}`);
      }
    }
    if (!s.brief.trim() && s.anchorTexts.length === 0) lines.push('(empty)');
    return lines.join('\n');
  });
  return blocks.join('\n\n');
}

export async function suggestIntroFromScript(input: SuggestIntroInput): Promise<IntroParts> {
  const script = input.scriptContent.trim();
  const sectionsBlock = formatSections(input.sections);
  // Bail only when there is genuinely nothing to chew on: no script body
  // AND no useful section context (briefs or linked anchors). One sentence
  // of script + no sections is also too thin.
  const hasUsefulSections = input.sections.some((s) => s.brief.trim() || s.anchorTexts.length > 0);
  if (script.length < 120 && !hasUsefulSections) {
    throw new Error('not enough to work with yet - fill in section briefs or draft some of the script first');
  }
  const voice = getVoiceSummary();
  const userPrompt = [
    `# Video title`,
    input.videoTitle,
    input.videoGoal ? `\n# Goal of this video for the viewer\n${input.videoGoal}` : '',
    sectionsBlock
      ? `\n# Section briefs + linked stories (the user's stated INTENT for each part)\n${sectionsBlock}`
      : '',
    script
      ? `\n# Drafted full script body (when present, this is the most authoritative source)\n${script}`
      : '\n# Drafted full script body\n(empty - rely on the section briefs and linked stories above)',
    voice ? `\n# the creator's voice (calibrate to this)\n${voice}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const raw = await callBridge(INTRO_SYSTEM, userPrompt);
  return parseParts(raw);
}
