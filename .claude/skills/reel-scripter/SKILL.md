---
name: reel-scripter
description: Find clippable moments inside the creator's existing video transcripts and produce a reel editing brief - timestamp range, verbatim spoken line (locked as-is), on-screen text overlay per beat, b-roll suggestions, caption, hashtags. Does NOT invent new spoken lines; the spoken track is the existing footage the creator already shot. Use when the user wants to repurpose published YouTube videos as Instagram reels, extract reel clips from any existing video transcript, or convert long-form video into vertical 9:16 reel briefs. Reads brand context files first and pauses for human approval on clip selection before writing the full brief.
---

# Reel Scripter

Turn existing video transcripts into shoot-ready Instagram Reel briefs. The video already exists - this skill writes the editing instructions.

## Required vault data

The skill ERRORS OUT and names the missing file if any of these are absent:

- `03_Projects/instagram/instagram-context.md` - the IG-specific positioning, audience, CTAs, voice deltas, hard nos, hashtag pool
- `01_Core/core_voice-style.md` - master voice rules
- `01_Core/core_audience.md` - master audience persona
- `../content-extractor/frameworks.md` - shared reference for caption skeleton, voice anti-patterns, on-screen text patterns (only sections 4, 5, 6 are relevant to reels)

Also ERRORS OUT if `instagram-context.md` still contains any `<FILL IN>` placeholders.

## Quick start

```
/reel-scripter 05_Assets/Transcripts/positioning-myth.md
/reel-scripter 05_Assets/Transcripts/positioning-myth.md --section "around the niche example"
```

Input is a transcript that maps to actual published video footage. The transcript MUST contain enough specificity (verbatim phrasing, ideally timestamps) for clip selection to be accurate.

## Workflow

### Step 1 - Load context

Read instagram-context.md, core_voice-style.md, core_audience.md. Hold the IG context as the strictest constraint.

### Step 2 - Read the transcript

Load the full transcript. Note whether it has timestamps. If no timestamps, use line numbers or surrounding-line excerpts to locate clips - tell the user the brief will reference "rough location" rather than precise timestamps.

### Step 3 - Scan for clippable moments

A clippable moment is a self-contained beat that:

- Opens with a verbatim line that works as a stop-scrolling hook (contrarian, specific number, question, result-first claim)
- Resolves within 20-60 seconds of spoken material (rough heuristic: 50-150 words spoken at conversational pace)
- Stands alone without setup from earlier in the video
- Has a clear single takeaway

Find 3-7 candidates. Score them subjectively for: hook strength, standalone clarity, alignment with the IG content pillars in instagram-context.md.

### Step 4 - CHECKPOINT: Present candidates

Present a numbered list. STOP and WAIT for the user to pick.

```
1. Clip: <one-line summary>
   Verbatim hook (0-3s): "<exact line from transcript>"
   Location: <timestamp range OR rough position>
   Estimated length: <Xs>
   Why it works: <one-line reasoning>
   Pillar: <which IG content pillar from instagram-context.md>

2. ...
```

Ask: "Which clip(s) do you want a full brief for?"

If the user wants more candidates or wants you to look in a specific section, re-scan and repeat the checkpoint.

### Step 5 - Write the editing brief

For each approved clip:

1. Generate a slug: kebab-case, max 5 words, from the hook line.
2. Create folder: `03_Projects/instagram/<YYYY-MM-DD>-<slug>/`
3. Write `reel-script.md` matching the format in REFERENCE.md.
4. Copy the relevant transcript excerpt to `source-excerpt.md` in the same folder.

Critical rules for the brief:

- **The Hook section uses the verbatim spoken line.** Do not paraphrase. If the line needs trimming (e.g. removing an "um"), mark the edit explicitly in square brackets.
- **The Beats table has no "spoken line" column you can write.** The spoken track is whatever's in the existing video. The columns are: location/timestamp, what the creator said (verbatim quote from transcript), on-screen text overlay (NEW, written for the eye), b-roll cue (optional).
- **On-screen text is YOURS to write.** Punchy, short, ≤ 8 words per overlay. Reinforces but doesn't duplicate the spoken line.
- **CTA / payoff section** is the closing beat. If the video closes naturally on a payoff line, identify it. Then add a separate on-screen CTA card at the end (e.g. "More on Solopreneur Systems → link in bio") - this is added in editing, not spoken.
- **Specs section** lists target length, pacing notes, audio style (trending vs original - reels usually keep the creator's original audio because the spoken track is the value), aspect ratio 9:16.
- **Caption** follows the 7-part skeleton in `../content-extractor/frameworks.md` Part 4. The caption complements the verbatim spoken hook - it doesn't repeat it.
- **On-screen text** patterns drawn from `frameworks.md` Part 6 (hook patterns) and the on-screen text guidance in `reel-scripter/REFERENCE.md`. Both: tight, ≤ 8 words, never duplicates the spoken line.
- **Hashtags** drawn from the pool in instagram-context.md, 8-15 tags.
- **Every line written by this skill** (on-screen text, caption, hashtags) passes the voice anti-patterns kill list in `frameworks.md` Part 5.

### Step 6 - Report

End the run with:

```
Wrote N reel briefs:
- 03_Projects/instagram/2026-06-01-niche-myth/reel-script.md
- 03_Projects/instagram/2026-06-01-niche-myth/source-excerpt.md
- ...
```

## Hard rules

- No em dashes anywhere. Hyphens only.
- NEVER invent or paraphrase a spoken line. The spoken track is what's already on tape.
- If a candidate clip's verbatim hook is weak, do NOT rewrite it - either present a different clip or tell the user this transcript doesn't have a strong reel in this section.
- On-screen text and caption are freshly written for IG and follow the creator's voice.
- Pull the CTA from instagram-context.md. Never invent.
- 9:16 aspect ratio. Non-negotiable.
- Target 30-60s default length (range allowed: 20-90s if the moment demands it).

## Advanced

See `REFERENCE.md` for the exact `reel-script.md` section format, clip-scoring heuristics, and on-screen text patterns.
