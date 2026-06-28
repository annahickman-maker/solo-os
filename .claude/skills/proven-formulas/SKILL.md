---
name: proven-formulas
title: Proven Formulas
card: See what's winning in your niche and refresh your title formulas
description: 'Scan the creator watchlists for what is outperforming right now and turn it into reusable title formulas - the outlier titles, the structures common across the niche, and what is breaking the mould. Updates the title radar file that the Title Generator reads. Runs weekly and on demand. Use when the user asks to refresh the title radar, see what is working in their niche, or run their creator research.'
category: Research
icon: research
schedule:
  trigger: time
  cadence: weekly
  at: "Mon 06:00"
  output: updates your title radar (06_Swipe/asset_title-radar.md)
  enabled: true
---

# Proven Formulas

What's actually winning in your niche right now, turned into title formulas you can reuse. This is the research behind every title - the Title Generator reads what this produces, so it's writing from current data instead of guesses.

## Before you start

This needs your title radar set up - your YouTube API key plus the channels and keywords you watch. If `scripts/title_radar_config.py` is missing, set it up right here before scanning: read and follow the youtube-setup-api skill (in your skills folder under `youtube-setup-api/SKILL.md`) to connect YouTube and pick your watchlists, then continue with the scan below. Don't just point the user elsewhere - run the setup in this chat.

## Run the scan

Run the radar from the vault root:

```
python3 scripts/title_radar.py
```

It pulls recent videos from your watch-channels and your keyword searches, and flags outliers - titles beating that channel's own baseline. The raw scan lands in `06_Swipe/asset_title-radar.md`. If it fails, tell the user plainly and stop.

## Pull the formulas

Read the scan and shape it into three buckets:

- **Outlier titles** - the ones beating their channel's baseline. Work out what makes each pop: a register shift (casual where the niche is formal), specificity (precise numbers, timeframes), contradiction (pushes against expected advice), vulnerability (an honest admission), or an absurd comparison. Write each as a reusable formula with placeholders, e.g. `how I [result] without [thing everyone assumes you need]`.
- **Common across your niche** - the structures that show up again and again in the keyword results. The proven, evergreen patterns.
- **Breaking the mould** - the pattern interrupts: titles that look nothing like the rest and are still winning.

## Save it

Write the three buckets back into `06_Swipe/asset_title-radar.md` in a clean, reusable format - each formula with one real example pulled from the scan, and the scan date at the top. This is the exact file the Title Generator reads.

## Show what's winning

Give a short, skimmable read - a few formulas per bucket, each with one real example:

> Here's what's working in your niche this week:
>
> **Outliers:** [2-3 formulas + example each]
> **Common across your niche:** [2-3 formulas]
> **Breaking the mould:** [2-3 formulas]

Keep it tight. This is research, not a report.

## Rules

- Only real data from the scan - never invent titles, numbers, or examples.
- Formulas are patterns with placeholders, not copied titles.
- Never use - (em dash). Use - instead.
