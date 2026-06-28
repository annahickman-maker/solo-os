/**
 * Content analysis - "are you showing up?" for the Reputation page.
 *
 * Reads transcripts from vault video files (not D1), brand context from
 * 01_Core/core_*.md, POV bank from 05_Assets/POVs/*.md, and asks Claude
 * (via the local bridge) to score consistency on 4 dimensions.
 *
 * Cached at 00_System/reputation-analysis.json. Refresh re-runs the model.
 */

import fs from 'node:fs';
import path from 'node:path';
import { abs, loadCollection, loadFile } from '../vault.js';

const CACHE_FILE_REL = ['00_System', 'reputation-analysis.json'] as const;
import { BRIDGE_URL } from './bridge.js';

export type DimensionAnalysis = {
  id: 'value' | 'authority' | 'point_of_view' | 'connection';
  label: string;
  consistency_pct: number;
  what_claude_noticed: string;
  opportunities: string[];
};

export type ContentAnalysisResult = {
  generated_at: number;
  sample_size: number;
  model: string;
  dimensions: DimensionAnalysis[];
};

const SYSTEM_PROMPT = `
You are analyzing CONSISTENCY of brand dimension presence across a creator's
published video transcripts. The question for each dimension is: across the body
of work, how consistently does this dimension actually land INSIDE the videos?

Long-form video is the biggest touch point opportunity a creator has. Each
published video is a chance to reinforce the brand. The more consistently each
dimension surfaces across the videos, the more reputation compounds with the
audience. Inconsistency means missed opportunity - touch points wasted.

The 4 dimensions and what to look for in transcripts:

1. VALUE - Does the video DELIVER USEFUL INSIGHT that helps the viewer move
   toward the creator's stated transformation (the After State above)? Score
   based on whether the teaching ladders to the transformation, NOT on whether
   it uses the named method label.

   IMPORTANT: A video that teaches "how to price web design", "how to write
   evergreen content", "how to automate client work" all DELIVER VALUE if
   the creator's transformation is "build a lean one-person business" -
   because each tactic moves the viewer toward that After State. Score those
   as high-Value even if the named method/system isn't explicitly invoked.

   What counts as Value:
   - Concrete teaching/insight/framework the viewer can act on
   - Belief shift, not just tactic dump
   - The takeaway moves the viewer toward the stated transformation
   - It's a teaching video, not a vlog or pure proof video

   What does NOT count as Value:
   - Pure entertainment with no takeaway
   - Sales-only content
   - Updates/announcements
   - Topics that don't relate to the transformation at all

   DO NOT penalise for the absence of a named system label. Penalise only
   when the teaching doesn't ladder to the transformation or doesn't move
   beyond surface tips into insight.

2. AUTHORITY - Do real numbers, specific client wins, dated personal results
   actually get spoken inside the videos? Not "I made money" generic talk, but
   "$50K from one launch in September 2024" specific proof. Are wins from the
   brag bank surfacing in the transcripts?

3. POINT OF VIEW - Do the stated POVs from the bank get articulated in the
   actual content, even without using POV jargon? Does the creator argue against
   common industry beliefs inside the videos? Do they take stances or stay
   neutral? IMPORTANT: do NOT penalize the absence of POV jargon in titles -
   titles need to be accessible to cold audience. Score POV based on the
   TRANSCRIPTS: does the contrarian stance land in the actual talking?

4. CONNECTION - Are personal stories, micro-anecdotes, vulnerable moments told
   inside the videos? Or is the talk purely instructional and polished? Does the
   creator break the fourth wall, admit struggle, name specific moments from
   their own life? How often does that happen across the body of work?

Use TRANSCRIPTS as the primary signal. Titles are only useful for one question:
"is the right audience being attracted?" Otherwise titles are noise here.

For each dimension return:
- consistency_pct: 0-100 (percentage of videos where this dimension surfaces
  in a meaningful, substantive way; not just one passing mention).
- what_claude_noticed: ONE short sentence, max 18 words. Scannable at a glance.
  No setup phrases. State the pattern.
- opportunities: exactly 3 short action items. Each item max 22 words. Start
  with a verb. Reference one concrete thing from their POVs, wins, or stories
  - no vague advice. No setup, no preamble, just the action.

NO overall summary. The 4 dimension cards speak for themselves.

HARD WRITING RULES:
1. NEVER use the em dash character (U+2014). Use a regular hyphen "-" instead.
2. Be brutally concise. The user is scanning these cards, not reading prose.

Return ONLY valid JSON in this exact shape:
{
  "dimensions": [
    { "id": "value", "label": "Value", "consistency_pct": 0-100, "what_claude_noticed": "...", "opportunities": ["...", "...", "..."] },
    { "id": "authority", "label": "Authority", "consistency_pct": 0-100, "what_claude_noticed": "...", "opportunities": ["...", "...", "..."] },
    { "id": "point_of_view", "label": "Point of View", "consistency_pct": 0-100, "what_claude_noticed": "...", "opportunities": ["...", "...", "..."] },
    { "id": "connection", "label": "Connection", "consistency_pct": 0-100, "what_claude_noticed": "...", "opportunities": ["...", "...", "..."] }
  ]
}
`.trim();

function safeStr(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function stripEmDashes(s: string): string {
  return s.replace(/-/g, '-').replace(/–/g, '-');
}

function bullet(items: string[], max = 12): string {
  return items.slice(0, max).map((s) => `- ${s}`).join('\n');
}

function readCore(filename: string): string {
  try {
    const raw = fs.readFileSync(abs('01_Core', filename), 'utf8');
    // Strip frontmatter so the model sees just the prose.
    return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  } catch {
    return '';
  }
}

// Pull all published video transcripts from 04_Channel/04_Projects/*.md
function loadVideoTranscripts(): Array<{ title: string; transcript: string }> {
  const entries = loadCollection('04_Channel/04_Projects', { type: 'video' });
  const out: Array<{ title: string; transcript: string }> = [];
  for (const e of entries) {
    const fm = e.frontmatter as any;
    if (fm?.status !== 'published') continue;
    if (fm?.archived) continue;
    // The body is "# Title\n\n## Transcript\n\n<text>\n## Description..."
    // Extract just the transcript section.
    const transcriptMatch = e.body.match(/##\s+Transcript\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
    let transcript = '';
    if (transcriptMatch) {
      transcript = transcriptMatch[1]!.trim();
    } else {
      // Fall back to the whole body minus the heading.
      transcript = e.body.replace(/^#\s+[^\n]*\n?/, '').trim();
    }
    if (!transcript || transcript.length < 200) continue;
    out.push({ title: fm.title ?? e.id, transcript });
  }
  return out;
}

// POVs from 05_Assets/POVs/*.md
function loadPOVs(): string[] {
  const povs = loadCollection('05_Assets/POVs', { type: 'pov' });
  return povs.map((e) => {
    const fm = e.frontmatter as any;
    const title = fm.title ?? e.id;
    // Try to extract first paragraph for context.
    const opinion = e.body.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '';
    return opinion ? `${title} -> ${safeStr(opinion).slice(0, 140)}` : title;
  });
}

function loadAllPublishedTitles(): string[] {
  return loadCollection('04_Channel/04_Projects', { type: 'video' })
    .filter((e) => {
      const fm = e.frontmatter as any;
      return fm?.status === 'published' && !fm?.archived;
    })
    .map((e) => (e.frontmatter as any).title ?? e.id);
}

function readBank<T>(name: 'wins' | 'micro-stories'): T[] {
  try {
    return JSON.parse(fs.readFileSync(abs('00_System', `${name}.json`), 'utf8')) as T[];
  } catch {
    return [];
  }
}

function buildPrompt(): { text: string; sampleSize: number } {
  const positioning = readCore('core_positioning.md');
  const ip = readCore('core_ip.md');
  const story = readCore('core_my-story.md');
  const audience = readCore('core_audience.md');
  const povs = loadPOVs();
  const titles = loadAllPublishedTitles();
  const transcripts = loadVideoTranscripts();
  const wins = readBank<{ title: string; body?: string; kind?: string; metric?: string }>('wins');
  const microStories = readBank<{ text: string; source_episode?: string }>('micro-stories');

  const text = `
# BRAND CONTEXT (what they say they want to be known for)

## Positioning
${positioning ? positioning.slice(0, 3000) : '(not set)'}

## Audience
${audience ? audience.slice(0, 2000) : '(not set)'}

## Core IP / Method
${ip ? ip.slice(0, 3000) : '(not set)'}

## Origin Story (for connection signal)
${story ? story.slice(0, 2000) : '(not set)'}

## POV bank (${povs.length} stances - these should be LANDING inside videos)
${bullet(povs, 25) || '(empty)'}

## Brag / Wins bank (${wins.length} entries - these should surface as specific proof inside videos)
${bullet(
  wins.map((w) => `[${w.kind ?? 'own'}] ${w.title}${w.metric ? ` (${w.metric})` : ''}`),
  15
) || '(empty)'}

## Confirmed micro-stories (${microStories.length} - these should be retold inside videos)
${bullet(
  microStories.map((s) => safeStr(s.text).slice(0, 200)),
  10
) || '(empty)'}

# PUBLISHED VIDEO TRANSCRIPTS TO ANALYZE
${transcripts.length} of ${titles.length} published videos have full transcripts below.
Titles are listed for context but the analysis should be primarily on the
transcript text - what actually gets said in the videos.

## All published video titles (${titles.length})
${bullet(titles, 50) || '(none)'}

## Full video transcripts (truncated to first 3000 chars each to fit budget)
${
  transcripts
    .map((v, i) => `### [${i + 1}] "${v.title}"\n${safeStr(v.transcript).slice(0, 3000)}`)
    .join('\n\n') || '(no video transcripts in vault yet)'
}
`.trim();

  return { text, sampleSize: transcripts.length };
}

function clampPct(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

async function callClaude(system: string, user: string): Promise<string> {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'contentAnalysis',
      system,
      user,
      maxTokens: 3500,
      expectJson: true,
    }),
  });
  if (!res.ok) throw new Error(`claude-bridge ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { text?: string; error?: string };
  if (data.error) throw new Error(`claude-bridge: ${data.error}`);
  if (!data.text) throw new Error('claude-bridge: no text in response');
  return data.text;
}

export async function runContentAnalysis(): Promise<ContentAnalysisResult> {
  const { text, sampleSize } = buildPrompt();
  const raw = await callClaude(SYSTEM_PROMPT, text);

  // Parse JSON envelope (claude --output-format=json or stripped fences).
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

  const dims: DimensionAnalysis[] = (['value', 'authority', 'point_of_view', 'connection'] as const).map(
    (id) => {
      const found = (parsed.dimensions ?? []).find((d: any) => d.id === id) ?? {};
      return {
        id,
        label:
          id === 'value' ? 'Value'
          : id === 'authority' ? 'Authority'
          : id === 'point_of_view' ? 'Point of View'
          : 'Connection',
        consistency_pct: clampPct(found.consistency_pct ?? found.presence_pct),
        what_claude_noticed:
          typeof found.what_claude_noticed === 'string'
            ? stripEmDashes(found.what_claude_noticed.trim())
            : '',
        opportunities: Array.isArray(found.opportunities)
          ? found.opportunities
              .filter((s: any) => typeof s === 'string' && s.trim())
              .slice(0, 3)
              .map((s: string) => stripEmDashes(s.trim()))
          : [],
      };
    }
  );

  const result: ContentAnalysisResult = {
    generated_at: Math.floor(Date.now() / 1000),
    sample_size: sampleSize,
    model: 'claude-code',
    dimensions: dims,
  };

  // Cache to JSON file in vault.
  const cacheFile = abs(...CACHE_FILE_REL);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf8');

  return result;
}

export function loadCachedAnalysis(): ContentAnalysisResult | null {
  try {
    const raw = fs.readFileSync(abs(...CACHE_FILE_REL), 'utf8');
    return JSON.parse(raw) as ContentAnalysisResult;
  } catch {
    return null;
  }
}

// For the cache file's age check - also serves as "current sample size"
// before any analysis has been run.
export function currentSampleSize(): number {
  return loadVideoTranscripts().length;
}

// Quick reference to source file paths for diagnostics.
export function diagnostics() {
  void loadFile; // intentionally available for callers
  return {
    cache_file: abs(...CACHE_FILE_REL),
    transcripts_dir: abs('04_Channel', '04_Projects'),
    povs_dir: abs('05_Assets', 'POVs'),
    core_dir: abs('01_Core'),
  };
}
