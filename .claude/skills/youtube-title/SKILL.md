---
name: youtube-title
description: 'Generate 40 YouTube title options for a video - 30 optimised for curiosity and click (20 from the proven formulas in the weekly title radar, 10 shorter ones in the user''s own voice), plus 10 optimised for search, written from a live scan of the tutorial-style videos ranking for this exact topic right now. Every title run through the content focus avatar so the right viewer knows it is for them. Also produces 5 thumbnail phrases to mix and match. Reads the video transcript when one is attached. Use whenever the user asks to write, generate, or rework a YouTube title.'
title: Title Generator
card: Generate 40 titles - 30 for curiosity, 10 for search
category: Create
inputs:
  - type: video
  - type: text
    optional: true
    label: Or a video idea
outputs:
  - type: content
    description: the title options attached to the selected video
---

# YouTube Title

Writes 40 title options for a video, plus 5 thumbnail phrases. There are two jobs a title can do, and this covers both:

- **Optimise for curiosity (titles 1-30)** - the click. 20 come from the proven formulas in your title radar (what's actually winning in your niche right now), 10 are shorter, in your own voice. These win the browse feed and suggested column, where nobody was looking for you.
- **Optimise for search (titles 31-40)** - the query. Straightforward, tutorial-style titles built to match what people already type into search when they want exactly what this video teaches. These win the search results and the long tail, where someone already knows what they want.

Every single title gets run through your focus avatar, so the right viewer feels it's for them - whether or not it names them.

## Before you start

Open warm - something like "Hey [first name], let's find your title." Then load your context quietly in the background; never narrate file reads or paths.

Read your foundation (from Solo OS onboarding):

- `01_Core/core_voice-style.md` - so titles sound like you
- `01_Core/core_positioning.md` and `01_Core/core_audience.md` - who you help and the transformation

Then load your content focus avatar - the specific person this video is for. Read `content_focus_avatar` from `00_System/state.md` (a path to an avatar file) and read that avatar in `05_Assets/Avatars/`. It's the one selected on your Content page. If none is set, fall back to `core_audience.md`.

If your core files aren't set up yet, stop and say: run /solopreneur-onboarding first.

## Your title radar (background, weekly)

The radar refreshes on its own once a week. You don't run it by hand and the user never sees it happen.

- Read `06_Swipe/asset_title-radar.md` quietly. It already holds the proven formulas: the outlier titles, the common-across-niche structures, and what's breaking the mould right now. Use them. Do NOT show a "here's what's working, confirm?" step - that's background research, not a conversation.
- If the file is fresh this week, use it as-is. Never re-scan a fresh radar - that's the slow wait we're avoiding.
- Only if it's missing or older than this week AND the API is set up, run `python3 scripts/title_radar.py` quietly, then read it. If it can't run, just move on - never block the user on the radar.
- Also read `06_Swipe/asset_content-analytics.md` if it exists (your own channel's high/low-CTR patterns) and quietly lean toward what works for you. If it's missing, skip silently. Never prompt about it mid-flow.

## Search the topic (background, per video)

The radar tells you what wins the browse feed. This tells you what wins search - the tutorial titles ranking for THIS video's topic right now. It's a live scan, run per video, quietly in the background. The user never sees the mechanics.

- **Lead with the primary keyword** - the single word or phrase someone types when they're looking for a video like this (for a content-workflow video, that's `content workflow`). Then add 1-3 close variants for range. Use the plain, literal words a searcher uses, not your curiosity angle - e.g. `notion dashboard tutorial`, `how to automate your business`. Lean on the searcher's language from `core_audience.md`.
- Run it quietly from the vault root, passing the main keyword first and each variant as its own argument:
  ```
  python3 scripts/title_search.py "content workflow" "content system" "repurpose content"
  ```
  It returns the long-form videos YouTube ranks for those searches, with view counts. These returned titles are the formula bank for titles 31-40 - you'll lift each strong one's structure and refill it with the user's keyword and specifics (see "Optimised for search" below). Note which framings pull the most views; those are the structures worth adapting first.
- If it prints `NOT_SET_UP`, the YouTube API isn't connected. Don't block - still write the 10 search titles, just from the searcher's own language in `core_audience.md` and your read of the topic instead of live data. Mention once, lightly, that connecting the API (via /youtube-setup-api) would make the search titles sharper. If it prints `NO_RESULTS` or errors, do the same - move on, never make the user wait.

## Read the video

- If a video is selected and it has a transcript attached, READ THE TRANSCRIPT. The titles come from what you actually said and the results the video delivers - not a guess.
- If the video has a concept or brief but no transcript yet, use that.
- If the user typed a fresh idea in the box instead, use that.

## Is there enough to work with?

Decide quietly:

- **Enough** = a transcript, OR a real concept/brief (what it covers + the result it delivers). Go straight to titles.
- **Not enough** = basically a bare title with no substance. Ask for what's missing, one or two questions max:
  > "Quick thing before I write your titles - what's the main result someone gets from this video, and what does it actually cover?"

Don't over-interview. As soon as you can name the result and the gist, write.

## Run every angle through the avatar

Before writing, list the different **results** this video could promise - the deepest desires it speaks to. Like the Idea Sharpener: not the surface topic, the thing the viewer actually wants. Play with as many as you can pull from the script.

Then, for every title you write, run it through your focus avatar: would this exact person feel *"that's for me, I need that right now"*? If it doesn't land that, it doesn't make the list - whether or not it names them by label. The audience should know it's for them from the result and their own language, not because you stuck "for freelancers" on the front.

## Write 40 titles

### Optimised for curiosity (1-30)

**20 from the proven formulas.** Use the formulas in your radar - the outliers, the common-across-niche structures, the pattern interrupts that are working right now. Ground them in what's actually winning, not generic templates. Spread them across the different results you listed.

**10 in your own voice.** Shorter. The way you'd say it out loud if you were just telling someone what this video gives them. Less polished, more human. Push on the range of desires - different angles on what people actually want from this.

### Optimised for search (31-40)

**These are adaptations of the real titles ranking for this keyword.** Do NOT invent search titles from scratch. The `title_search.py` results ARE your formula bank - the same way the radar's outliers become formulas, each ranking title becomes a template you refill with your keyword and your specifics.

The mechanic, per title:

1. **Take a strong ranking title from the search results** - prefer the ones with the clearest structure and the highest views for the keyword.
2. **Judge how well it already fits this video** - that decides how far you move from it (see below).
3. **Refill with the user's keyword and this video's real specifics** - pull the specifics from the transcript/brief so the promise is true to what the video actually delivers, and write it in the user's voice (lowercase, their phrasing).

**Adaptation distance scales with fit.** How far you move from the ranking title depends on how well it already describes this video. Three bands, all legitimate:

- **Near-exact keep** - when the ranking title already describes what the user actually did, keep it almost word-for-word (just their casing/voice). E.g. `How I Automated My Entire Content Workflow with Claude Code` -> `how i automated my entire content workflow with claude code` (use as-is if they really did that).
- **Light swap** - keep the skeleton, change one specific to theirs. E.g. Dan Koe's `My Entire Content Ecosystem (Turn One Newsletter Into 1 Week Of Content)` -> `my entire content ecosystem (turn one call into 1 week of content)`.
- **Re-theme** - keep the structure, retarget to the user's angle. E.g. `The 4 Hour Weekly Content System (Copy Me)` -> `my 1-hour weekly content workflow (copy this)`.

Two hard lines that never bend, whichever band you're in:

- **It must be TRUE to this video** - never claim a tool, result, or number the video doesn't actually deliver just because the ranking title had it. Truth sets the distance: if the title fits, keep it close; if it doesn't, change what's untrue.
- **It must read in the user's voice** - lowercase, their phrasing. Not a copy-paste of someone else's exact styling.

Rules for this group:

- **Lead with the keyword** - the exact words someone types to find this. Front-load them so it reads as an obvious match.
- **Be literal over curious** - state what the video does. A search title that explains beats one that teases.
- **No keyword stuffing** - one clear keyword phrase, read naturally.
- **Spread across the different ranking structures** you got back - don't rewrite the same one 10 times. If the search returned five distinct formulas, use all five.

The avatar test still applies to all 40, but it lands differently for the search titles: the win is *"yes, this is exactly the thing I searched for"* - recognition and match - not the curiosity pull the first 30 go for.

## 5 thumbnail phrases

The title and thumbnail work as a unit - together they say the most in the fewest words. Write 5 thumbnail phrases that mix and match against any of the 40 titles.

- 3-5 words max each
- Must say something NOT already in the title - never repeat title language
- Each adds one of: a desirable result, a credibility signal (number / timeframe / proof), or an "I haven't seen this" angle
- No more than 1 word in all caps
- Mix the gap types across the 5 - don't write 5 versions of the same gap
- Play with what's in vs out of the title: pull a strong phrase out of a title and onto the thumbnail, or let the thumbnail carry the proof the title only implied

## Present

Show the titles in three groups, then the thumbnail phrases. Make the split visible so the user knows which titles do which job:

```
**Optimised for curiosity - the click**

From the proven formulas (1-20):
1. [title]
...
20. [title]

In your voice (21-30):
21. [title]
...
30. [title]

**Optimised for search - the query (31-40):**
31. [title]
...
40. [title]

**Thumbnail phrases (mix with any title):**

- **A** - [3-5 words] - [gap: result / credibility / haven't seen this]
- **B** - [3-5 words] - [gap]
- **C** - [3-5 words] - [gap]
- **D** - [3-5 words] - [gap]
- **E** - [3-5 words] - [gap]
```

Then:

> "YouTube lets you A/B test up to 3 titles and 3 thumbnails per video. Pick up to 3 of each - any combination. The title and thumbnail are one message, so go for combinations that say the most together with the least overlap. If this topic is something people actively search for, it's worth testing one search-optimised title (31-40) against your curiosity picks - the search title keeps earning clicks long after the browse spike fades."

STOP - wait for the user to pick.

## Refine

If they pick one or want changes:

- Ask what they want to adjust
- Offer 2-3 variations on that direction
- Run the quick checklist:
  - [ ] Clear within 2 seconds?
  - [ ] Around 50-65 characters (critical info in the first 50)?
  - [ ] Would the avatar feel it's for them?
  - [ ] Creates tension or desire rather than just explaining?
  - [ ] A specific detail that makes the promise believable?
  - [ ] Could it be shorter without losing meaning?

STOP - confirm the final pick(s) before closing.

## Title rules

- Clarity over cleverness - understood in 2 seconds.
- 50-65 characters, critical info first (mobile truncates around 60).
- Strategic capitalisation only - 1 word max for emphasis, no more than 3 capitalised words.
- Numbers feel concrete - odd numbers (7, 13, 17) read more authentic than round ones.
- No keyword stuffing, no filler ("basically", "literally", "honestly"), no emojis.

## Rules

- 40 titles total: 30 optimised for curiosity (20 from the radar formulas + 10 in the user's own voice) and 10 optimised for search (tutorial-style, keyword-led). Plus 5 thumbnail phrases.
- Every title passes the avatar test - the right viewer feels it's for them. For the search titles that means recognition ("that's exactly what I searched"), not curiosity.
- No explicit/implied audience split.
- Present the 5 thumbnail phrases as a vertical list, one per line (A-E) - never run them together in a sentence.
- The radar is background and weekly; the topic search (`title_search.py`) is background and per-video. Use both quietly, never make the user wait on them, never surface their mechanics.
- If the topic search prints `NOT_SET_UP`, still write the 10 search titles from the audience's own language - don't drop them, and don't block.
- Read the video's transcript when one is attached.
- Never invent examples, proof, or statistics - only the user's real content.
- Titles must sound like the user (read `core_voice-style.md`).
- Never use - (em dash). Use - instead.
- Respect every STOP condition.
