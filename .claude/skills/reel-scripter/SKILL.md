---
name: reel-scripter
description: 'Find clippable moments inside your existing video transcripts. First it writes each clip out as its verbatim script (one paragraph each), then for any clip you pick one of two directions: clip-as-is (an editing brief - on-screen text, b-roll, caption, hashtags - over the footage you already shot) or seed-idea (rewritten into a cohesive, Instagram-ready post in your voice). Clip-as-is never invents spoken lines; the spoken track is the footage you already shot. Use when the user wants to repurpose published videos as Instagram reels or pull reel clips from any existing transcript. Reads brand context first and pauses for clip selection before writing.'
title: Reel Clipper
card: Find clippable moments from your transcripts and edit into reels
category: Create
inputs:
  - type: transcript
    multiple: true
outputs:
  - type: content
    description: reel editing briefs or Instagram-ready posts
schedule:
  trigger: event
  event: transcript-uploaded
  output: a task in your inbox to clip reels from the new transcript
  enabled: true
---

# Reel Clipper

Turn existing video transcripts into Instagram reels. The video already exists. First surface the clippable moments as verbatim scripts; then, per clip, the user picks one of two directions.

## Required vault data

The skill ERRORS OUT and names the missing file if any are absent:

- `03_Projects/instagram/instagram-context.md` - IG positioning, audience, CTAs, voice deltas, hard nos, hashtag pool
- `01_Core/core_voice-style.md` - master voice rules
- `01_Core/core_audience.md` - master persona
- `../content-extractor/frameworks.md` - shared reference for the caption skeleton, voice anti-patterns, and on-screen text patterns (sections 4, 5, 6)

Also ERRORS OUT if `instagram-context.md` still contains any `<FILL IN>` placeholders.

## Quick start

```
/reel-scripter 05_Assets/Transcripts/positioning-myth.md
/reel-scripter 05_Assets/Transcripts/positioning-myth.md --section "around the niche example"
```

The transcript must map to actual published footage and carry enough specificity (verbatim phrasing, ideally timestamps) for accurate clip selection.

## Workflow

### Step 1 - Load context

Read instagram-context.md, core_voice-style.md, core_audience.md, and frameworks.md (sections 4-6). Hold the IG context as the strictest constraint.

### Step 2 - Read the transcript

Load it fully. Note whether it has timestamps. If not, locate clips by line or surrounding excerpt and tell the user the brief will reference "rough location."

### Step 3 - Find clippable moments

A clippable moment opens on a strong verbatim hook, resolves in 20-90s of spoken material, stands alone without earlier setup, and has one clear takeaway. Use the scoring heuristic in REFERENCE.md. Bias toward fewer, stronger clips.

### Step 4 - FIRST MESSAGE: write each clip out as its verbatim script

This is the first thing the user sees after selecting the transcript. For every clip, write the spoken content out as a paragraph, VERBATIM from the transcript (stitch the lines as spoken; trim only filler like "um", marking any cut with [...]). No table, no editing notes yet - just the script.

```
Here are the clips I'd pull from this video - each is the verbatim script, written out:

1. <short label>  (~<Xs>, around <location>)
"<verbatim paragraph - the exact spoken lines for this clip>"

2. <short label> ...
```

Then offer the two directions and STOP:

> Pick a clip and a direction:
> 1. Clip as is - I write the editing brief (on-screen text, b-roll, caption, hashtags) to cut the footage you already shot.
> 2. Seed idea - I rewrite it into a cohesive, Instagram-ready post in your voice (fresh copy, not locked to the verbatim).

Wait for the pick. Do not proceed without it.

### Step 5 - Direction 1: Clip as is (editing brief)

Write the brief readably - NO table. Follow the reel-script.md format in REFERENCE.md:

- **Script** - the verbatim paragraph, broken into its natural beats with a rough timecode in plain text before each line. The spoken line is LOCKED - never paraphrase. Mark any trim with [...].
- **On-screen text** - a short list of overlay suggestions tied to moments. Each <= 8 words, reinforces but never duplicates the spoken line.
- **B-roll / shots** - a short list of shot suggestions.
- **CTA card** - the closing payoff line (verbatim, if any) plus an on-screen CTA card added in edit, using the main CTA from instagram-context.md.
- **Caption + hashtags** - caption follows frameworks.md Part 4; 8-15 hashtags from instagram-context.md in their own block.
- **Specs** - target length, pacing, original audio (the voice is the value), 9:16.

Then **queue it to Instagram** (see "Queue to Instagram" below) with `status: "filmed"` so it lands in the **ready to edit** lane - the footage already exists. Keep the saved item minimal and the SAME shape as everything else in the queue: put the verbatim script (broken into beats, one beat per line) in `script`, the timestamped moments in `source_moments`, and the hook label in `title`. Do NOT save the on-screen-text / b-roll / CTA / specs into the item - the ready-to-edit card shows only the script and the source moments. Set `source_transcript_filename`.

### Step 5b - Direction 2: Seed idea (Instagram rewrite)

Treat the clip as a seed. REWRITE it into a cohesive, ready-to-post Instagram piece in the user's voice - this direction is NOT verbatim-locked. Follow the reel-seed.md format in REFERENCE.md:

- The rewritten piece - a tight talking-head script or a written post, whichever fits, cohesive start to finish and ready to record or publish.
- Caption + hashtags (same caption skeleton + hashtag pool rules).

Every line passes the voice anti-patterns kill list in frameworks.md Part 5.

Then **queue it to Instagram** (see "Queue to Instagram" below) with `status: "queued"` so it lands in the **ready to film** lane - it needs recording. Put the rewritten script (beats one per line) in `script`, the original verbatim line in `original_quote`, the timestamped moments in `source_moments`, and set `source_transcript_filename`.

### Step 6 - Queue to Instagram

Both directions queue into the Instagram queue at `00_System/instagram-queue.json` (a JSON array the dashboard reads). To queue an item:

1. Read the file and read ONE existing entry to match its exact shape.
2. Append a new entry, then write the array back (never overwrite existing entries):

```json
{
  "id": "ig-reel-<unix-seconds>-<4 random chars>",
  "text": "<short label / the hook line>",
  "title": "<short label, the hook>",
  "tag": "value | connection | pov | authority",
  "kind": "story",
  "status": "queued (seed idea -> ready to film) | filmed (clip as is -> ready to edit)",
  "reel_origin": "clip (clip as is) | film (seed idea)",
  "queued_at": <unix-seconds>,
  "source_transcript_id": "<transcript id if known>",
  "source_transcript_filename": "<transcript filename, so the video is easy to find>",
  "source_moments": [{ "timestamp": "mm:ss", "text": "<verbatim phrase to find in the footage>" }],
  "script": "<the editable script, beats separated by line breaks>",
  "original_quote": "<seed idea only: the verbatim seed line>"
}
```

Same shape for both directions: `script` + `source_moments` (+ `original_quote` for seeds). No `edit_plan` or other fields. Use `date +%s` for the timestamp.

### Step 7 - Report

End by confirming what you queued and to which lane (ready to film / ready to edit), with the source transcript filename.

## Hard rules

- No beats table. Always write the script out as paragraphs / plain-text beats.
- No em dashes. Hyphens only.
- Clip as is: NEVER invent or paraphrase a spoken line - the spoken track is what's on tape. If a clip's verbatim hook is weak, present a different clip or say this section has no strong reel.
- Seed idea: rewriting is expected - it's a fresh post inspired by the clip, in the user's voice.
- On-screen text and captions are freshly written for IG.
- Pull the CTA from instagram-context.md. Never invent.
- 9:16. Target 30-60s (range 20-90s).

## Advanced

See `REFERENCE.md` for the reel-script.md format, the seed-idea format, the clip-scoring heuristic, and on-screen text patterns.
