---
name: youtube-description
description: 'Generate a complete, ready-to-publish YouTube description in one shot from a video transcript and finalised title. Produces the full description with CTA at the top, a 2-sentence hook paragraph, and timestamped chapters extracted from the transcript. Pulls the user''s channel CTA from their channel positioning. Use whenever the user directly asks to write, generate, or rework a YouTube description. Auto-triggering on a dropped transcript is handled by /youtube-post-film, not this skill.'
title: Description Generator
card: Generate a YouTube description from a finished transcript
category: Create
inputs:
  - type: video
    scope: transcribed
outputs:
  - type: content
    description: the description attached to the selected video
schedule:
  trigger: event
  event: transcript-uploaded
  output: the video's YouTube description (saved to its description field)
  enabled: true
---

# YouTube Description

Writes a complete YouTube description from a transcript and finalised title. One-shot output - CTA, hook, and chapters all in one response. User edits after, not section-by-section.

---

## When to use this skill vs /youtube-post-film

| Scenario | Skill |
|---|---|
| User asks to "write a description" / "generate a description" with title + transcript ready | This skill (`/youtube-description`) |
| User drops a raw transcript and expects the system to handle the post-filming flow (archive script, update voice, generate description) | `/youtube-post-film` (which calls this skill internally) |

If a transcript drops with no other context, default to `/youtube-post-film`. Only run this skill standalone if the user explicitly asks for a description.

---

## Preflight

1. Read `04_YouTube/core_channel-positioning.md`. If missing, STOP: "Run /youtube-onboarding first to set up channel positioning."
2. Read `01_Core/core_voice-style.md` so the description sounds like the user.
3. Read `04_YouTube/core_channel-positioning.md` to get the channel CTA text + link. Read `01_Core/core_offer-suite.md` if the channel CTA points to a different offer than the primary CTA - the channel CTA always wins for video descriptions.

---

## Required inputs

Confirm before writing. If missing, ask.

- The full video transcript (with timestamps if possible)
- The finalised video title

If timestamps are missing, write chapter titles only and flag at the end that the user needs to add times manually.

---

## Step 0 - Tracking link (only if conversion tracking is set up)

Per-video tracking links are optional. They depend on the member having run
`/setup-conversion-tracking`, which deploys their own Cloudflare worker and
creates `scripts/link_manifest.json` in their vault.

**Check setup:** does the vault have BOTH `03_Projects/agents/worker/wrangler.toml`
AND `scripts/link_manifest.json`?

- **Not set up (soft gate):** skip tracking entirely. The CTA in the description
  uses the raw channel CTA link from `04_YouTube/core_channel-positioning.md`.
  At the end of the output, add one line: *"Tip: run /setup-conversion-tracking
  to get per-video click attribution on your CTA links."* Then go to "Generate
  the description in one shot". Skip the rest of Step 0.

- **Set up:** mint a per-video tracking slug as below so every video gets its
  own click attribution.

### Find the tracking base URL

Read `03_Projects/agents/worker/wrangler.toml`. If an active `routes` block
exists, the base is the host in `pattern = "<host>/go/*"` (e.g. `theirdomain.com`).
If the routes block is commented out, the worker publishes to
`<their-worker>.<their-account>.workers.dev` - ask the member for that URL (they
saw it printed on deploy). Call the result `<tracking-base>`.

### Slug logic

1. **If the title starts with `day N:` (Day X build-in-public series):** slug = `day-N` (lowercase, no leading zero). Examples: `day-1`, `day-12`.
2. **Otherwise:** slug = `video-<3-to-5-word-slug-from-title>`. Strip filler words (the, a, how, to, you, your, my, of), lowercase, hyphens, no special chars. Example: `"how I went from zero to 1000 subs"` -> `video-zero-to-1000-subs`.
3. **Collision check:** read `scripts/link_manifest.json` (in the vault). If the slug already exists, append `-v2` (or `-v3`, etc) until unique.

### Destination logic

Default destination is the channel CTA link from `04_YouTube/core_channel-positioning.md`. Every video gets its own slug pointing at it, so clicks attribute back to the specific video.

Override only if:
- The video's primary CTA is a discovery call (from `01_Core/core_offer-suite.md`): ask the user "Primary CTA is the call - use the universal `call` slug, or mint a per-video slug pointing at the call link?" Default to the universal `call` slug unless the user wants per-video attribution.
- The user explicitly named a different destination URL in the request.

### Update the manifest

Read `scripts/link_manifest.json` (in the vault). Add a new top-level key:

```json
"<slug>": {
  "destination": "<destination URL>",
  "source": "<full video title>",
  "created": "<today YYYY-MM-DD>"
}
```

Preserve the `_meta` block at the top and every existing entry. Write the file back. Order: keep `_meta` first, then existing entries in their current order, then the new entry at the bottom.

### Tracking URL

The CTA in the description uses: `<tracking-base>/go/<slug>`. After updating the manifest the member redeploys the worker (`cd 03_Projects/agents/worker && npm run deploy`) to make the new slug live.

---

## Generate the description in one shot

Pull the channel CTA + link. Write the hook paragraph. Extract the chapters. Output everything at once. The user can make changes to the link, the hook, or any chapter after - don't ask for step-by-step approval.

### Component 1 - CTA

Use the CTA text from `core_channel-positioning.md`. If tracking is set up, swap the raw link for the tracking link minted in Step 0: `<tracking-base>/go/<slug>`. If tracking is NOT set up, use the raw channel CTA link as-is.

If a secondary "hop on a call" CTA is included and tracking is set up, use the universal call link: `<tracking-base>/go/call` (no per-video version - the call slug is universal). Without tracking, use the raw call link from the offer suite.

The CTA structure from `01_Core/core_offer-suite.md` (soft invite, pre-dismissal, two CTAs) stays intact - only the URLs change.

### Component 2 - Hook paragraph (exactly 2 sentences)

Each sentence on its own line, blank line between them.

**Sentence 1 - what the video shares + the result:**

Use one of these framings:
- "In this video, I share [the specific thing/framework/system] that helped me [achieve specific result]."
- "In this video, I share [the specific thing] that's going to help you [achieve specific result]."

The first framing leans on the user's own credibility (they've done it). The second leans on the viewer's outcome (what they'll get). Pick whichever is stronger for the video.

**Sentence 2 - who it's for and what problem it solves:**

Be direct. Name the audience. Name the problem.
- "Built for [specific person] who [specific situation/struggle]."
- "If you're [specific situation], this gives you [specific path/outcome]."

**SEO note:** include the primary keyword (the search phrase the video is built around) naturally in sentence 1 or 2. Don't keyword-stuff. One natural inclusion is enough - YouTube's algorithm picks up on natural phrasing far better than forced keywords.

Format:
```
[Sentence 1]

[Sentence 2]
```

### Component 3 - Chapters (4-6 of them)

Extract 4-6 key sections from the transcript.

**Chapter rules:**
- As few words as possible
- Don't fully explain - add some curiosity
- But near enough to make it clear what each chapter is about
- Match what the user actually says, not marketing language
- Use timestamps if available: `0:00 - Chapter title`. If not, just chapter titles.
- First chapter is always `0:00 - Intro` (or whatever name matches what the intro is about)

Examples of chapter naming:
- Weak (too explanatory): "How to use the 5-step framework to write your first script"
- Strong (curiosity + clarity): "The 5-step framework"
- Weak (vague): "Tips and tricks"
- Strong: "What I'd skip if I started over"

---

## Output format

Output the full description in one block, ready to paste:

```
[CTA text from channel positioning] -> [CTA link, with UTM if applicable]

[Hook sentence 1]

[Hook sentence 2]

What we cover:
0:00 - [chapter 1]
[time] - [chapter 2]
[time] - [chapter 3]
[time] - [chapter 4]
[time] - [chapter 5]
```

If timestamps are missing, append:

> "Note: I extracted the chapter sections but couldn't pull timestamps from the transcript. Add the times manually before publishing."

After the description, briefly note any choices made the user might want to swap:
- Which CTA was used (from channel positioning)
- Whether sentence 1 used the "I share / helped me" framing or "going to help you" framing
- Anything else the user might want to tweak

If tracking is set up, append the manifest update block:

```
New tracking link added to manifest:
  slug: <slug>
  destination: <destination URL>
  full link: <tracking-base>/go/<slug>

Deploy with: cd 03_Projects/agents/worker && npm run deploy
```

If tracking is NOT set up, append instead: *"Tip: run /setup-conversion-tracking to get per-video click attribution on your CTA links."*

---

## Rules

- One-shot output. Do not present in steps. Do not stop mid-write for approval.
- Hook paragraph: exactly 2 sentences. Each on its own line. Blank line between them.
- Chapters: as few words as possible. Curiosity over explanation. Clarity over cleverness.
- Include the primary keyword naturally in the hook for SEO. One natural inclusion only.
- Tone: natural, direct, not salesy. Sounds like the user wrote it.
- Only use content from the transcript. Do not add or invent.
- Never use hashtags.
- Never add extra links beyond the user's channel CTA.
- Never keyword-stuff.
- If conversion tracking is set up, mint a tracking slug + update the manifest in Step 0 before writing the description, and the CTA uses `<tracking-base>/go/<slug>`. If it is not set up, use the raw channel CTA link and skip tracking - never invent a tracking domain.
- Never use - (em dash). Use - instead.
