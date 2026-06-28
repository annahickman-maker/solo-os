---
name: automate-task
title: Automate a Task
card: Set up a skill to run on a schedule or a trigger
description: 'Set up automation for a skill - run it on a schedule (daily/weekly) or on a trigger (like a new transcript landing), and decide where the output goes. Walks the user through it conversationally, writes the schedule into the skill, and wires up the automation on their machine (setting up the runner the first time). Use when the user clicks Schedule on a skill, or asks to automate, schedule, or set a trigger for a skill.'
category: Meta
hidden: true
---

# Automate a Task

Set up a skill to run on its own - on a schedule or a trigger - and save where the result goes. This is a calm, plain-language setup. One question at a time. At the end the skill's Schedule pill shows the cadence.

The run that opened this tells you which skill is being automated: its **title**, its **name**, and its **file path**. Read it and the automate-task instructions silently - never narrate "let me read..." or any preamble. Your first words to the user are the warm greeting below. If the target skill is missing, just ask which skill they want to automate.

## What you're setting up

Three things, in plain language:

1. **What triggers it** - a time (every day / every week at a set time) or an event (something happening, like a new transcript landing on a video).
2. **How often / exactly when** - the day and time for a schedule, or the specific event.
3. **Where the output goes** - where the result should land when it runs on its own.

## The conversation

Open warm and lead with their name: "Hey [first name], let's set up [skill title] to run on its own. Want it to run on a schedule, or when something happens?"

Then, one at a time:

- **Trigger type.** Time-based (a schedule) or event-based (on a trigger)?
- **If time-based:** daily or weekly? What time? (For weekly, which day?) Keep it human: "every Monday at 6am."
- **If event-based:** what's the event? The one we support today is **a new transcript landing on a video**. Name it clearly back to them.
- **Where the output goes.** Confirm the destination in their words. For the Description Generator on a new transcript, the output is that video's YouTube description (saved to its `description` field, shown under Content).

Reflect the whole thing back in one sentence before saving: "So: [skill] runs [when], and the result goes to [where]. Good?"

## Save the schedule

Write a `schedule` block into the target skill's frontmatter (its file path was given to you). Match this shape exactly so the dashboard can read it:

```yaml
schedule:
  trigger: time          # time | event
  cadence: weekly        # time-based: daily | weekly
  at: "Mon 06:00"        # time-based: 24h time, prefix the weekday for weekly
  event: transcript-uploaded   # event-based only (omit for time-based)
  output: the video's YouTube description (saved to its description field)
  enabled: true
```

Only include the keys that apply (a time trigger has no `event`; an event trigger has no `cadence`/`at`). Keep the rest of the frontmatter untouched.

**Critical - where it goes:** the frontmatter is ONLY the block between the FIRST `---` and the very next `---` at the top of the file. Add `schedule:` there as a single top-level key, ONCE. The `---` lines inside the body are section dividers, NOT frontmatter - never insert the schedule block after those. If a `schedule:` block already exists, replace it in place; never add a second one. After saving, the file must contain exactly one `schedule:` key.

## Wire up the automation

The schedule block is the intent. Now make it actually run.

### First time only - set up the runner

The first time anyone automates a task, there's no runner yet. Check whether `~/Library/LaunchAgents/com.<creator>.skill-runner.plist` (or any existing skill-runner) is present.

If it's NOT set up, walk the user through it once, plainly:

1. Explain: "To run skills on their own, I set up a small background runner on your Mac. It only runs your skills - nothing else. One-time setup, takes a minute."
2. It needs permission to run in the background. If Full Disk Access is required for the runner script, point them to System Settings > Privacy & Security > Full Disk Access and have them add the runner (or `/bin/bash`), then come back.
3. Create the runner once and confirm it loaded.

If a runner already exists, skip all of this - just add the new job.

### Time-based - a scheduled run

Create (or add to) a LaunchAgent that runs the skill headless on the cadence. The job runs the skill in the vault with Claude headless, e.g. `claude -p "run the <skill name> skill"`. Use `StartCalendarInterval` for the day/time. Log to `/tmp`. Load it with `launchctl`. Confirm it's registered.

If this skill already runs on a schedule another way (some come pre-wired, like the title radar's weekly agent), don't double it up - point the schedule at the existing job and just record the `schedule` block so the pill shows it.

### Event-based - a trigger

For "a new transcript landing on a video," hook into the transcript watcher: when a new transcript is detected for a video, run the skill for that video and save the output to the destination you confirmed (for Description Generator, the video's `description` field). If a transcript watcher already exists, extend it; if not, set one up the same careful way as the runner.

## Close

Confirm it's live: "Done - [skill] is set to run [when]. You'll see the schedule on its card. You can change or turn it off anytime by clicking the schedule again."

## Rules

- One question at a time. Plain language, no jargon. This is setup, not a lecture.
- Never overwrite the rest of the target skill's frontmatter - only add/update its `schedule` block.
- Only set up automation the user confirmed. Never auto-enable without a clear yes.
- The first-time runner setup happens once. After that, adding a schedule is just adding a job.
- Never use - (em dash). Use - instead.
