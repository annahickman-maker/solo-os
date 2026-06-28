---
name: youtube-title
description: 'Generate 30 YouTube title options for a video - 20 built from the proven formulas in the weekly title radar, plus 10 shorter ones in the user''s own voice - every title run through the content focus avatar so the right viewer knows it is for them. Also produces 5 thumbnail phrases to mix and match. Reads the video transcript when one is attached. Use whenever the user asks to write, generate, or rework a YouTube title.'
title: Title Generator
card: Generate 30 click-worthy YouTube titles using proven formulas
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

Writes 30 title options for a video, plus 5 thumbnail phrases. 20 of the titles come from the proven formulas in your title radar (what's actually winning in your niche right now), and 10 are shorter, in your own voice. Every single title gets run through your focus avatar, so the right viewer feels it's for them - whether or not it names them.

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

## Write 30 titles

**20 from the proven formulas.** Use the formulas in your radar - the outliers, the common-across-niche structures, the pattern interrupts that are working right now. Ground them in what's actually winning, not generic templates. Spread them across the different results you listed.

**10 in your own voice.** Shorter. The way you'd say it out loud if you were just telling someone what this video gives them. Less polished, more human. Push on the range of desires - different angles on what people actually want from this.

All 30 have to pass the avatar test above. No "explicit audience / implied audience" split - that's gone.

## 5 thumbnail phrases

The title and thumbnail work as a unit - together they say the most in the fewest words. Write 5 thumbnail phrases that mix and match against any of the 30 titles.

- 3-5 words max each
- Must say something NOT already in the title - never repeat title language
- Each adds one of: a desirable result, a credibility signal (number / timeframe / proof), or an "I haven't seen this" angle
- No more than 1 word in all caps
- Mix the gap types across the 5 - don't write 5 versions of the same gap
- Play with what's in vs out of the title: pull a strong phrase out of a title and onto the thumbnail, or let the thumbnail carry the proof the title only implied

## Present

Show the titles in two groups, then the thumbnail phrases:

```
**From the proven formulas (1-20):**
1. [title]
...
20. [title]

**In your voice (21-30):**
21. [title]
...
30. [title]

**Thumbnail phrases (mix with any title):**

- **A** - [3-5 words] - [gap: result / credibility / haven't seen this]
- **B** - [3-5 words] - [gap]
- **C** - [3-5 words] - [gap]
- **D** - [3-5 words] - [gap]
- **E** - [3-5 words] - [gap]
```

Then:

> "YouTube lets you A/B test up to 3 titles and 3 thumbnails per video. Pick up to 3 of each - any combination. The title and thumbnail are one message, so go for combinations that say the most together with the least overlap."

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

- 30 titles total: 20 from the radar formulas + 10 in the user's own voice. Plus 5 thumbnail phrases.
- Every title passes the avatar test - the right viewer feels it's for them.
- No explicit/implied audience split.
- Present the 5 thumbnail phrases as a vertical list, one per line (A-E) - never run them together in a sentence.
- The radar is background and weekly - use it if fresh, never make the user wait on it, never surface its mechanics.
- Read the video's transcript when one is attached.
- Never invent examples, proof, or statistics - only the user's real content.
- Titles must sound like the user (read `core_voice-style.md`).
- Never use - (em dash). Use - instead.
- Respect every STOP condition.
