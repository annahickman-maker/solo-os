---
name: content-extractor
description: Mine the creator's transcripts and notes for distinct ideas, then rewrite the approved ones as Instagram carousels - slide-by-slide written copy, caption, hashtags, and a structured carousel.json + human-readable carousel.md. The source provides raw thinking and verbatim phrasing; the carousel is freshly written for IG. Use when the user wants to turn workshop teaching, voice notes, Q&A calls, video transcripts (as idea fodder, not for clipping), or any rough material into IG-native carousel content. Reads brand context files first and pauses for human approval on the content plan before writing final assets.
---

# Content Extractor

Turn raw transcripts and notes into shippable Instagram carousels. Source = ideas and verbatim phrasing. Output = freshly written IG-native copy.

## Required vault data

The skill ERRORS OUT and names the missing file if any of these are absent:

- `03_Projects/instagram/instagram-context.md` - the IG-specific positioning, audience, CTAs, voice deltas, hard nos, hashtag pool
- `01_Core/core_voice-style.md` - master voice rules
- `01_Core/core_audience.md` - master audience persona
- `01_Core/core_my-story.md` - for proof / personal anecdote sourcing
- `05_Assets/POVs/` - the creator's IP library (read titles, load specific POVs if relevant to a chosen atom)
- `frameworks.md` (alongside this SKILL.md) - content categories, carousel formulas, title angle bank, caption skeleton, voice anti-patterns, hook patterns

Additionally, the skill ALSO ERRORS OUT if `instagram-context.md` still contains any `<FILL IN>` placeholders. the creator must fill it before first real run.

## Quick start

```
/content-extractor 05_Assets/Transcripts/Live-Workshops/lesson-1-positioning.md
/content-extractor 05_Assets/Transcripts/QA-Calls/qa_2026-05-28.md
/content-extractor 05_Assets/Transcripts/Live-Workshops/   # batch mode
```

## Workflow

### Step 1 - Load context

Read all required vault files in this order: instagram-context, core_voice-style, core_audience, core_my-story (skim), POV titles list, frameworks.md (full). Hold the IG context as the strictest constraint - it overrides the master where they conflict. frameworks.md provides the structural taxonomy and voice anti-patterns - the bones, not the words.

### Step 2 - Read the transcript(s)

For a single file: read the full transcript.
For a folder: list .md / .txt files, process each one in turn (or ask which subset if more than 5).

### Step 3 - Extract atoms

For each transcript, identify distinct "content atoms." An atom is one self-contained, shareable idea. Valid atom shapes:

- A claim + its supporting reasoning
- A framework or step-by-step method
- A specific story or anecdote with a clear takeaway
- A data point or proof receipt
- A hot take or contrarian flip
- A "before-and-after" transformation moment

For each atom, tag it with the best-fit category from `frameworks.md` Part 1 (one of 23). The category determines which carousel formula gets used in Step 5 - this happens internally and is NOT surfaced in the user-facing plan.

Also pull strong verbatim lines. the creator's phrasing is the voice signal - preserve any line that already sings (mark these as `verbatim:` in the plan).

Anti-patterns - do NOT create an atom for:
- Pure filler / connective tissue
- An idea that needs 3+ paragraphs of setup to land
- Anything already in the published 04_Channel YouTube backlog with the same framing (skim titles to check)
- An idea that maps to the Engagement Invitations category - default away from these unless `instagram-context.md` explicitly says they fit

### Step 4 - CHECKPOINT 1: Content plan

Present a numbered list to the user. STOP and WAIT for approval. The internally-selected category and formula are NOT shown - the plan reads naturally.

For each proposed hook, draw on the hook patterns in `frameworks.md` Part 6 and the angle bank in Part 3 for the atom's category. Generate hooks that match the creator's voice (no enthusiasm filler, no rhetorical questions that need the body to make sense).

```
1. Atom: <one-line summary>
   Proposed hook: "<one-line cover slide line>"
   Source: <transcript path>, around <rough location/quote>
   Strong verbatim: "<line from transcript>" (if any)

2. ...
```

Ask: "Which atoms do you want as carousels? Want to tweak any hooks before I write?"

Wait for explicit selection. Do not proceed without it.

### Step 5 - Write each approved carousel

For each approved atom:

1. Generate a slug: kebab-case, max 5 words, from the hook.
2. Create folder: `03_Projects/instagram/<YYYY-MM-DD>-<slug>/`
3. Pick the carousel formula. The atom's category (set in Step 3) maps to one of the 16 formulas in `frameworks.md` Part 2. Follow the bone-only skeleton for slide roles. The skeleton is structural - do not lift any phrasing from it (it has none) or from external sources.
4. Write `carousel.json` matching the schema in REFERENCE.md (strict JSON, validated before write).
5. Write `carousel.md` - a human-readable preview of the same content.
6. Copy or symlink the source transcript snippet as `source-excerpt.md` (the relevant section only, not the whole transcript).

Slide rules:
- 1 hook + 4-8 body + 1 CTA. Total 6-10 slides.
- One idea per slide. If a slide tries to do two things, split it.
- `headline` ≤ 8 words, punchy.
- `body` ≤ 30 words. Often much less.
- `visual_note` = short instruction for the renderer (e.g. "big number left-aligned", "two-column before/after", "quote on solid colour, no photo").
- CTA slide uses the main CTA from instagram-context.md verbatim, or a near-paraphrase. Never invent a new CTA.
- Every slide passes the voice anti-patterns kill list in `frameworks.md` Part 5. If a draft slide hits any item on that list, rewrite it.

Caption rules:
- Follow the 7-part skeleton in `frameworks.md` Part 4 (hook → relatability → context → pivot → body → synthesis → CTA). Keep it tight - short captions for low-friction posts, longer only when the teaching demands it.
- The hook line on the caption complements slide 1, doesn't repeat it.
- Pull 8-15 hashtags from the pool in instagram-context.md. Do not invent new tags. Hashtags in their own block below the caption, never inline.

### Step 6 - Report

End every run by printing:

```
Wrote N carousels:
- 03_Projects/instagram/2026-06-01-positioning-myth/carousel.json
- 03_Projects/instagram/2026-06-01-positioning-myth/carousel.md
- 03_Projects/instagram/2026-06-01-positioning-myth/source-excerpt.md
- ...
```

## Hard rules

- No em dashes anywhere. Hyphens only.
- No engagement bait, no fake urgency, no guru language.
- Voice MUST come from the creator's files - if a slide sounds generic, rewrite it.
- Verbatim phrases from the transcript are GOLD - use them on the hook slide whenever possible.
- Never invent a CTA. Pull from instagram-context.md.
- If instagram-context.md has unfilled placeholders, ERROR. Do not generate.

## Advanced

See `REFERENCE.md` for the exact `carousel.json` schema, slide-role taxonomy, carousel.md preview format, and slug rules.
