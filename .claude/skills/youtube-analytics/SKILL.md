---
name: youtube-analytics
description: 'Ongoing channel-wide analytics that constantly keeps up with what''s working and what isn''t across all the user''s YouTube videos. Run on a cadence (weekly, monthly, whenever) - it pulls the latest data, identifies patterns across the whole channel, updates 06_Swipe/asset_content-analytics.md with the current learnings, and surfaces actions to take. Not a one-video review - a continuous learning loop that informs content strategy, titles, thumbnails, and topic decisions over time. Use when the user says "run analytics", "check my channel performance", "what''s working on my channel", or wants to refresh their analytics learnings.'
card: Analyse your content for the metrics that truly matter.
category: Research
---

# YouTube Analytics

This is the ongoing channel-wide analytics loop. It's not about reviewing one specific video - it's about looking at the channel as a whole, learning what's working, and constantly improving the content strategy.

The user runs this on whatever cadence they want (weekly, monthly, ad-hoc). Each run:
- Pulls the latest data across ALL their videos
- Compares against benchmarks
- Identifies patterns across the channel (what topics, formats, titles, thumbnails are winning)
- Updates `06_Swipe/asset_content-analytics.md` with the current state of channel learnings
- Surfaces actions to take (videos to fix, videos to amplify, content directions to lean into, things to stop making)

The asset file is the channel's living memory. Every other skill (titles, ideas, thumbnails) reads it and gets smarter over time.

---

## Preflight

1. Read `01_Core/core_audience.md`, `01_Core/core_positioning.md` (set up in Solo OS onboarding). If your core files aren't set up yet, stop and say: run /solopreneur-onboarding first.
2. Load your content focus avatar - the specific person your channel is for. Read `content_focus_avatar` from `00_System/state.md` (a path to an avatar file) and read that avatar in `05_Assets/Avatars/`. If none is set, fall back to `core_audience.md`.

---

## Step 1 - Pull the latest data (from the dashboard, not a spreadsheet)

Every per-video metric lives in the dashboard now - one file per published video at
`04_Channel/04_Projects/yt-<id>.md` (or any project file linked by `youtube_id`).
The metrics are in the frontmatter:

- `view_count` - views (synced from YouTube)
- `ctr_pct` - impression click-through rate
- `sub_rate_pct` - subscribers gained / views
- `subscribers_gained`, `impressions` - supporting context
- `conversion_pct` - from the dashboard's own `/go/` link tracking (where wired)

How those get populated (so you can guide the user if data is missing):
- Views sync automatically: Content page -> "sync from youtube".
- CTR + sub rate come from a YouTube Studio export. CTR and impressions are
  Studio-only - NO YouTube API exposes them - so the user exports Studio ->
  Analytics -> Content -> "Table data.csv" and drops it on the Content page
  ("import analytics csv"). That fills `ctr_pct` / `sub_rate_pct` per video.
- Conversion comes from the dashboard's tracking links, not from YouTube.

Read every published video file and collect these metrics. Then read the existing
`06_Swipe/asset_content-analytics.md` (create if missing) so this run compares the
latest data against what's already logged.

**Freshness gate.** If most published videos have a null `ctr_pct`, the Studio
export hasn't been imported yet. STOP and tell the user:

> "I don't have CTR or sub-rate data on your videos yet - and CTR is Studio-only,
> so no API can pull it. Export YouTube Studio -> Analytics -> Content -> the
> 'Table data.csv' file, drop it on the dashboard's Content page ('import analytics
> csv'), then run me again. (Hit 'sync from youtube' first if recent videos are
> missing.)"

---

## Step 2 - Channel-wide read

This is NOT a single-video benchmark check. It's a channel-wide read.

Look at:

**Performance distribution across the channel:**
- How many videos are above CTR benchmark (>5%)? What patterns do they share?
- How many are in the benchmark band (3-5%)? What's typical for this channel?
- How many are below (<3%)? What patterns are common to those?
- Same logic for sub rate and conversion rate.

**Trends over time:**
- Are recent videos trending up or down vs older ones?
- Has anything shifted in CTR, sub rate, or conversion in the last 5-10 videos?
- Are certain topics consistently outperforming others?

**Outliers:**
- The user's best-performing videos (top CTR, top sub rate, top conversion). What do they have in common?
- The user's worst-performing videos. Common pattern?
- Any single video that converts at 2x+ the average? (These are funnel candidates - should be referenced from other videos.)

**Format/topic patterns:**
- Does audience-explicit titling outperform implied? Vice versa?
- Do framework videos beat tactical videos? Vice versa?
- Do certain topic clusters punch above their weight?

Apply the action maps and cross-metric patterns from this skill (full table below) to the channel as a whole, not video-by-video.

---

## Step 3 - Surface the channel state

Present a short overview, not a per-video report:

```
## Channel state - [date]

**Performance summary:**
- [N] videos analysed
- Average CTR: [X]% (benchmark 3-5%)
- Average sub rate: [X]% (benchmark 0.5-1%)
- Average conversion rate: [X]% (benchmark 0.5-1%)
- Trend over last 5 videos: [up / down / flat]

**What's working (top patterns):**
- [Pattern 1] - examples: [video titles]
- [Pattern 2] - examples: [video titles]

**What's not working (low patterns):**
- [Pattern 1] - examples: [video titles]
- [Pattern 2] - examples: [video titles]

**Funnel candidates (high-conversion videos to amplify):**
- [Video title] - [why it converts] - [recommended action]

**Channel opportunities:**
- [What topic/format/positioning shift the data suggests]
```

Keep this tight. The detail goes into the asset file (next step).

---

## Step 4 - Update the channel learnings file

Update `06_Swipe/asset_content-analytics.md` with everything new from this run.

Don't overwrite - append and refine. The asset file is the channel's growing memory.

Update these sections:

**High-CTR patterns** - add new patterns observed this run, with the source videos. If a previously-logged pattern is now reinforced by more data, refine the description. If a previously-logged pattern is now contradicted, add a note: "[Date] - this pattern weakened in recent videos, may have been topic-specific."

**Low-CTR warning patterns** - same logic.

**High-conversion videos (funnel candidates)** - update the list. If a video that was previously a strong funnel has dropped, note it. If a new video has emerged as a funnel candidate, add it.

**Recent review log** - append a row for this run:

```
| Date | Videos in scope | Avg CTR | Avg sub rate | Avg conversion | Channel verdict |
|---|---|---|---|---|---|
| [today] | [N videos] | [X%] | [X%] | [X%] | [one-line summary] |
```

Confirm to the user what was added/refined:
> "Updated `06_Swipe/asset_content-analytics.md` with [N] new patterns and [M] refined entries. /youtube-title and /youtube-ideas will pick up the new learnings the next time they run."

---

## Step 5 - Recommend actions

Based on the channel-wide read, surface 3-5 specific actions:

```
**Actions:**

1. **[Action]** - [Why, tied to a specific channel-wide pattern]
2. **[Action]** - [Why, tied to a specific channel-wide pattern]
...
```

Action types to consider:

| Channel pattern | Action |
|---|---|
| Strong funnel video identified | Add as end-screen recommendation across other videos. Reference in future scripts. |
| Topic cluster outperforming | Make more videos in this cluster. Update the video cue with 2-3 ideas in this direction. |
| Format/structure consistently winning | Lean into it for next 3 videos. Add to title generator's bias toward these formulas. |
| Recent videos trending down | Diagnose - has the audience targeting drifted? Has the topic mix shifted? Is the title style stale? |
| Specific video underperforming relative to peers | Re-evaluate title/thumbnail. Consider re-uploading with different packaging or referencing it from a stronger video. |
| Conversion is consistently weak across all videos | The CTA bridge isn't landing. Review the offer-to-content fit, not just packaging. |
| One topic/format consistently producing low CTR | Stop making this kind of content, or reframe it. |

Rules:
- Actions are channel-wide, not per-video. The point of running this loop is strategic course-correction.
- Every action ties to a specific pattern observed in this run. No generic YouTube advice.
- If the channel is healthy and trending well, say so. Don't manufacture problems.

STOP - present actions and ask if the user wants to dig into anything specific.

---

## Step 6 - Schedule reminder (optional, only on first run or when they ask)

If this is the user's first run, suggest a cadence:

> "How often do you want to run this?
>
> - **Weekly** - good if you publish 1+ videos per week. Keeps the learning loop tight.
> - **Monthly** - good if you publish less often. Lower friction, still keeps the asset file current.
> - **Ad-hoc** - run when you remember or when you feel the channel needs a check-in.
>
> Whatever you pick, the asset file is always your source of truth - other skills read it whenever they run."

If they want to schedule this on a recurring basis, point to the /loop or /schedule skills (those are separate skills outside this pack that handle recurring tasks).

---

## Asset file structure

`06_Swipe/asset_content-analytics.md`:

```markdown
---
type: asset
slug: content-analytics
status: active
tags:
  - type/asset
  - domain/analytics
---

# Content Analytics Learnings

The channel's living memory. Updated every time /youtube-analytics runs. Read by /youtube-title, /youtube-ideas, and other content skills to bias toward what's actually working.

## High-CTR patterns on this channel
- [Date] - [Pattern] - [Source videos] - [Strength: emerging / reinforced / weakening]

## Low-CTR warning patterns on this channel
- [Date] - [Pattern] - [Source videos] - [Strength: emerging / reinforced / weakening]

## High-conversion videos (funnel candidates)
- [Date] - [Video title] - [Why it converts] - [Action: reference from X, end-screen on Y]

## Topic/format clusters worth doubling down on
- [Date] - [Cluster description] - [Examples] - [Why it's working]

## Topic/format clusters to avoid or reframe
- [Date] - [Cluster description] - [Examples] - [Why it's not working]

## Channel state log
| Date | Videos in scope | Avg CTR | Avg sub rate | Avg conversion | Channel verdict |
|---|---|---|---|---|---|
```

---

## Action maps reference (apply to channel-wide patterns)

| Pattern | Action |
|---|---|
| CTR <3% across many videos | Audience-channel fit issue OR systemic title/thumbnail weakness. Diagnose which. |
| CTR >5% on a cluster of videos | Save those titles + thumbnails as channel reference. Use as templates. |
| Sub rate <0.5% with shallow comments across many videos | Content not landing. Add more personal experience. |
| Sub rate <0.5% with deep comments | Engagement strong but no clear reason to come back. Tighten the channel promise. |
| Sub rate >1% on a cluster | This topic/format converts viewers to subs. Make more in this lane. |
| Conversion <0.5% systemic | Offer-content bridge weak across the channel. Review CTAs and offer alignment. |
| Conversion >1% on specific videos | Funnel candidates - amplify via end-screens, in-script references. |
| High sales-page conversion downstream of a video | Premium funnel video. Send everything you can through it before they hit the sales page. |

---

## Rules

- This is a CHANNEL-WIDE loop, not a single-video review. Resist the urge to drill into individual videos unless they're clear outliers.
- Always update `06_Swipe/asset_content-analytics.md` - that's the contract that makes other skills smarter.
- Every action ties to a specific pattern from this run. No generic YouTube advice.
- Don't manufacture problems if the channel is healthy. Say it's healthy and stop.
- If the user pushes for a single-video review, run that, but redirect afterward: "For ongoing strategic learnings, run this skill on the whole channel."
- Never use - (em dash). Use - instead.
