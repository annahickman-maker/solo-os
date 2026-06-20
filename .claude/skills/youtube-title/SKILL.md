---
name: youtube-title
description: Generate 10 YouTube title options (5 with explicit audience callout, 5 implied audience) for a specific video idea, plus 5 thumbnail phrase options (3-5 words each) presented separately so they can be mix-and-matched with any title for A/B testing. Uses the title radar (if set up and fresh) to inform the 6 proven title formulas with what's currently outperforming in the user's niche. Use whenever the user asks to write, generate, or rework a YouTube title.
---

# YouTube Title

Generates strong title options informed by what's actually working in the niche right now, the user's own analytics patterns, and 6 proven title formulas. Title and thumbnail work as a unit - this skill produces 10 titles AND 5 thumbnail phrases that can mix-and-match for A/B testing.

The title radar is what makes the 6 proven formulas current. The formulas are evergreen patterns - the radar tells you which patterns are actually outperforming in the user's niche right now, so the titles are written using formulas grounded in real-time data, not just templates.

---

## Preflight

1. Read `04_YouTube/core_channel-positioning.md`. If missing, STOP: "Run /youtube-onboarding first to set up channel positioning."
2. Read `01_Core/core_voice-style.md`, `01_Core/core_audience.md`, `01_Core/core_positioning.md`.
3. Read `04_YouTube/core_channel-positioning.md` for the channel's transformation and target viewer.

---

## Soft setup gate - title radar

The title radar must be set up. The radar gets re-run every time this skill is used, so freshness is automatic - no need to check.

Check whether `06_Swipe/asset_title-radar.md` exists.

If it doesn't, STOP and ask the user:

> "Title radar isn't set up yet.
>
> Without it, this skill will generate titles based on your channel positioning and your past videos only - it won't be informed by real-time data on what's currently outperforming in your niche, so the suggestions will be less competitive.
>
> Want to run /youtube-setup-api first (about 10-15 minutes), or proceed without it?"

Wait for the user's choice. Never auto-pick.

If it IS set up, do not ask permission to run the radar - just run it in Step 1. The user already opted in by setting it up.

---

## Required inputs

Confirm before generating. If missing, ask.

- Video topic or core idea
- The transformation or result the video delivers
- Who it's for (specific or broad audience decision)
- Any proof points, numbers, or timeframes that could be used in titles

---

## Step 1 - Run the radar

If the title radar is set up, run the radar script every time - no freshness check needed:

```
python3 scripts/title_radar.py
```

Run from the vault root. Wait for completion. If it fails, note the error and proceed with whatever is in the file.

Then read `06_Swipe/asset_title-radar.md` and analyse the most recent scan data.

If the radar wasn't set up and the user opted to proceed without it, skip this step.

**For channel outlier data:** look at outlier titles vs typical titles for each channel. Extract reusable patterns:
- Register shift (unexpectedly casual where the niche is formal)
- Specificity (precise numbers, timeframes, concrete details)
- Contradiction (pushes against expected advice)
- Vulnerability (honest admission where most perform confidence)
- Absurdist comparison

Express each as a reusable formula with placeholders, e.g. `how I [specific result] without [thing everyone assumes is required]`.

**For keyword search results:** identify common structures (proven formulas) and pattern interrupts (titles that look noticeably different).

Present a brief summary:

> "Here's what's working in your niche right now:
>
> **Channel formulas** (from outlier titles):
> [2-3 formulas]
>
> **Proven structures** (common across your niche):
> [2-3 formulas]
>
> **Pattern interrupts** (breaking the mould right now):
> [2-3 formulas]"

STOP - wait for user to confirm.

---

## Step 2 - Check learnings from the user's own content

The analytics setup produces `06_Swipe/asset_content-analytics.md` (parallel to the title radar file). This file logs which title structures have proven high or low CTR on the user's own channel.

### Check 1 - is analytics set up?

Check whether `06_Swipe/asset_content-analytics.md` exists.

- **If it doesn't exist:** skip silently. The skill works without it. Don't prompt mid-flow - the user can set it up later via /youtube-setup-api (which configures the API connection used by all YouTube features including analytics).
- **If it exists:** continue to Check 2.

### Check 2 - is the data fresh?

Check the file's modification time or the timestamp inside the most recent log entry.

- **If last run was within the last 7 days:** use the existing data. Continue to the read step below.
- **If last run was more than 7 days ago:** STOP and ask the user:

> "Your content analytics data is [X] days old. Your own channel performance shifts as you publish - I'd recommend running a fresh analytics pull before I generate titles, so I can lean into the structures that are actually working for you right now.
>
> Run a fresh analytics pull (via /youtube-analytics, about 5 minutes), or proceed with the older data?"

Wait for the user's choice. If they say run fresh, hand off to /youtube-analytics, then come back here when it returns. If they say proceed, use the existing data.

### Read and apply the patterns

Once you have the analytics data (fresh or older-but-approved), read the patterns from `06_Swipe/asset_content-analytics.md`:
- **High-CTR patterns on your channel:** lean into these structures when generating titles
- **Low-CTR warning patterns on your channel:** avoid these structures

Use these to bias the title generation in Step 3.

---

## Step 3 - Generate 10 title options

### The relevance gate (runs before anything else)

Before a viewer can feel a curiosity gap, they have to know the title is about something they care about. If the ideal viewer scrolls past and cannot place the topic in under a second, the curiosity never gets a chance to fire. People do not click on things they cannot identify.

A title like "two numbers vs a thousand metrics" opens a gap in the abstract, but it is topic-ambiguous. The ideal viewer cannot tell whether this is about analytics, fitness, finance, business KPIs, or YouTube, so they scroll past, even if they are curious in principle, because the title has not told them this is for them.

The fix is to put a topic anchor in every title. A topic anchor is a noun, a domain word, a person-type, or a concrete object that lets the ideal viewer place the video in under a second. For the creator's channel, examples include "your business", "client work", "freelance income", "your offer", "your YouTube channel", "as a designer", and "as a creative freelancer". The anchor does not have to be the audience callout itself, but it has to be somewhere in the title so the domain is unambiguous.

Apply this gate first on every candidate. The test is: would the ideal viewer look at this title in under a second and know what it is about, and that it relates to their work? If they would have to read the description to figure it out, the title fails the gate and must be rewritten.

### The principle that gates the rest

Once relevance is established, curiosity gap is the whole job. Every formula below is a different mechanism for opening the same thing, which is a gap between what the viewer already knows and what they want to know. If a title does not open a gap, it does not get the click, regardless of which formula it uses.

Two specific failure modes have to be caught before any title is presented.

The first is that the title states the answer. If the viewer can guess the resolution from the title alone, the click dies. A title like "world's fastest drone tries to keep up with F1 car" telegraphs the ending. "F1 car vs world's fastest drone" sets up the tension without resolving it.

The second is that the gap only opens for the core audience. If a casual viewer in an adjacent space and a brand new viewer with zero context cannot feel the gap, the title will only reach people who already follow the channel.

### The CCN test

Every title has to pass the CCN test before it makes the final 10. CCN stands for core, casual, and new. The core audience already cares about the topic. The casual viewer is in the adjacent space but is not subscribed. The new viewer has zero context. A strong title makes all three want to click, and the descriptor usually does the heavy lifting. A descriptor like "the Mozart of Gen Z" travels far beyond the core, while a name like "Jacob Collier" only lands with people who already know who that is.

### The 8 formulas

Cover at least 5 of the 8 proven formulas across the 10 titles, and include at least one Comparison and at least one Format Lift.

1. **Compression** - [Large value] in [Small or specific time or effort]
2. **Blueprint or Framework** - My [System or Blueprint or Framework] for [Specific Result]
3. **Identity** - [Statement about who the viewer is or what they believe] + [Challenge or transformation]
4. **Authority** - [Credential or proof point] + [Specific claim]
5. **Pattern Interrupt** - Unexpected language that creates a mismatch with what the niche expects (use principles, not last week's buzzwords)
6. **Curiosity or Open Loop** - Hints at a result without giving it away. Brackets can work as a secondary hook
7. **Comparison or Step-up** - X vs Y, or X vs Y vs Z, where the gap between them creates the tension. Examples include "$25K vs $25M", "5 minutes vs 50 minutes", and "freelancer vs studio vs solo SaaS"
8. **Format Lift** - Borrow a proven format from an adjacent niche and apply it to this topic. The adjacent niche is the source of the format, and the topic is what you fill it with

### Generation process

Do this work internally before presenting anything. The user only sees the final 10, but the funnel underneath them is what makes them strong.

1. Generate 30 candidate titles internally, roughly 4 per formula across the 8 formulas. Five of those will be one-word variants of another, and that is the point.
2. For each candidate, mentally write the most exaggerated, almost-unbelievable version of the title, then write the dialled-back version next to it. The final candidate sits between those poles, closer to exaggerated than safe.
3. Write the most boring possible version of each candidate, the version a corporate marketing team would ship (the "how LA addresses its water shortage problem" version). Confirm none of the final titles are within striking distance of that floor.
4. Run every candidate through the relevance gate first. Drop any whose topic the ideal viewer could not place in under a second. Then score the survivors against the CCN test and the promise-not-resolution check. Drop any that fail either one.
5. Return the top 5 audience-explicit titles and the top 5 audience-implied titles from the survivors.

### Audience split

**Titles 1-5: Audience called out explicitly.** Must name the audience directly, for example "for coaches" or "for freelancers". These get fewer but better-matched clicks.

**Titles 6-10: Audience implied via descriptor.** Must NOT name the audience with a literal callout. They should lead with a descriptor or topic frame that travels beyond the core, so the casual and new viewer can also feel the gap. These cast wider.

**Self-check before presenting:** verify titles 1-5 each contain an explicit audience callout, and verify every one of the 10 passes both the CCN test and the promise-not-resolution check. If any fail, rewrite.

---

## Step 4 - Generate 5 thumbnail phrases

The title and thumbnail work as a unit - together they communicate the maximum amount in the fewest words. Generate 5 thumbnail phrase options that can be mixed-and-matched against any of the 10 titles.

**Rules** (cross-check with /youtube-thumbnail for deeper detail):

- 3-5 words maximum per phrase
- Bold, clear, high-contrast text
- Must communicate something NOT already in the title - never repeat title language
- Should add one of: a desirable result, a credibility signal (numbers/timeframe/proof), or an "I haven't seen this" angle (contrarian, format signal, depth indicator)
- No more than 1 word in all caps
- Mix gap types across the 5 - don't generate 5 versions of the same gap

**Play with what's in/out of the title:** since the title and thumbnail share the work, try variations where you pull a strong phrase OUT of the title and put it on the thumbnail instead, or where the thumbnail adds the proof point that the title implied.

---

## Step 5 - Present everything together

Present all 10 titles first, then all 5 thumbnail phrases below. The user picks up to 3 of each for A/B testing.

```
**Titles - calling out your audience (1-5):**

1. [title]
2. [title]
3. [title]
4. [title]
5. [title]

**Titles - audience implied (6-10):**

6. [title]
7. [title]
8. [title]
9. [title]
10. [title]

---

**Thumbnail phrases (mix and match with any title above):**

A. [3-5 word phrase] - [gap type: result / credibility / haven't seen this]
B. [3-5 word phrase] - [gap type]
C. [3-5 word phrase] - [gap type]
D. [3-5 word phrase] - [gap type]
E. [3-5 word phrase] - [gap type]
```

After presenting:

> "YouTube lets you A/B test up to 3 titles and 3 thumbnails per video. Pick up to 3 titles (any combination of the 10 above) and up to 3 thumbnails (any of A-E) - the combinations don't have to be paired the way I listed them. The title and thumbnail are a single message, so think about which combinations communicate the most together with the least overlap."

STOP - wait for the user to pick.

---

## Step 6 - Refine

If the user picks one or wants changes:
- Ask what they want to adjust
- Offer 2-3 variations on their chosen direction
- Run the title checklist:

- [ ] Clear within 2 seconds?
- [ ] 50-65 characters?
- [ ] Works for browse (curiosity, desire, pattern interrupt)?
- [ ] Includes keyword for search?
- [ ] Audience decision deliberate (explicit or implied, not accidental)?
- [ ] Could it be shorter without losing meaning?
- [ ] Does it create tension rather than just explain?
- [ ] Specific detail that makes the promise feel believable?
- [ ] Passes the relevance gate (ideal viewer can place the topic in under a second without reading the description)?
- [ ] Passes the CCN test (core, casual, and new viewer all feel the gap)?
- [ ] Passes the promise-not-resolution check (the title sets up tension but does not give away the ending)?

STOP - confirm final title(s) before closing.

---

## Title rules (from the framework)

- **Clarity over cleverness.** Viewer must understand within 2 seconds.
- **Length: 50-65 characters.** Critical info in first 50 (mobile truncation at ~60).
- **Strategic capitalisation only.** 1 word max for emphasis. Title Case as default.
- **Numbers feel concrete.** Odd numbers (7, 13, 17) feel more authentic than round numbers.
- **Search keyword in first 40-50 chars** if the video is search-optimised.
- **No keyword stuffing. No filler words** ("basically", "literally", "honestly").
- **No emojis. No more than 3 capitalised words.**

---

## Rules

- Never invent examples, proof, or statistics.
- Only use user-provided inputs and referenced notes.
- Read `core_voice-style.md` before writing - titles must sound like the user.
- Titles must come from the user's real content - not generic formulas applied blindly.
- Always 10 titles (5 explicit / 5 implied) AND 5 thumbnail phrases.
- Titles and thumbnails are presented separately so they can be mix-and-matched - never pair them 1-to-1.
- Never use - (em dash). Use - instead.
- Respect every STOP condition.
