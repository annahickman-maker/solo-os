---
name: create-an-automation-skill
description: 'One-time setup that builds you an automation - a skill that runs by itself when something happens (a call recording lands, a transcript drops, a day rolls around) and produces an output (a post in your inbox, a draft email, a summary). Walks you through what fires it and what it should do, writes the skill, then wires up the schedule and the background agent so it runs without you. Use when the user wants to automate something, set up an automation, build a skill that runs on a trigger or schedule, or says "create an automation".'
title: Create an Automation Skill
card: Build a skill that runs on its own
category: Meta
outputs:
  - type: content
    description: 'a new automation skill saved to your Skills page, wired to run on its own'
icon: meta
color: '#8A8A8A'
---

# Create an Automation Skill

This builds you an automation: a skill that runs on its own. It is the same idea as Create a Skill, with two extra jobs - it shows you what is worth automating, and once the skill is written it sets up the schedule and the background agent so the thing actually runs without you opening anything.

Run it once per automation. You end up with a new skill on your Skills page that fires by itself.

## Before you start

Read `REFERENCE.md` in this folder - it has the trigger types, the "how to pull a Zoom transcript" recipe, the topic-classification pattern, and the two worked examples (Q&A post, client recap) you can copy from. Follow the `write-a-skill` standard for the skill file itself - this skill follows it, then adds the automation layer on top.

## Step 1 - What do you want to automate?

Lead with examples, because most people do not know what is automatable until they see one. Offer these and ask which is closest, or have them describe their own:

| When this happens | The automation does this |
|---|---|
| A new Q&A / community call lands | Writes a recap post and drops it in your inbox |
| A new client strategy call lands | Drafts a recap email to that client in Gmail |
| A new video transcript drops | Queues social clips pulled from it |
| Every Monday morning | Builds a content report for the week |
| A new lead fills in your form | Drafts a warm personal reply |

The shape is always the same: **something happens, the automation does one job, the result lands somewhere.** Get those three in plain language before moving on.

## Step 2 - What fires it?

Pin down the trigger:

- **An event** - something happening. The proven one is "a new call recording or transcript lands." Name it clearly.
- **A schedule** - a time. Daily or weekly, and exactly when ("every Monday at 6am").

## Step 3 - What it does, and where the output goes

Confirm the one job and the destination in their words: a post in the inbox, an email draft in Gmail, a file in a folder, tasks on the list. Reflect it back in one sentence: "So when [trigger], it [does the job], and the result lands in [where]. Good?"

## Step 4 - Write the automation skill

1. Read `assets/generated-skill-template.md`.
2. Fill its `<<...>>` tokens (slug, title, card, description, category, the trigger, the action, the output, the paths it reads and writes).
3. Save to `.claude/skills/<<slug>>/SKILL.md` in their vault.

Set the frontmatter in full and keep the body under 100 lines, per `write-a-skill`.

## Step 5 - Wire up the schedule and the agent

This is what makes it real. Hand off to **automate-task** for the skill you just wrote: it writes the `schedule` block into the new skill's frontmatter and sets up the background agent (the LaunchAgent / watcher) the first time, so the automation runs on its own. If the trigger needs to tell two automations apart (a Q&A call versus a strategy call, say), set up the router to classify by topic and fire the matching skill - see the classification pattern in `REFERENCE.md`. Confirm it loaded.

## Close

Tell them it is live: name the skill, say what fires it and where the output lands, and that they can change or switch it off from the schedule pill on its card. From now on that automation runs without them.

## Hard rules

- The automation does exactly one job. Two outcomes means two automations.
- No em dashes anywhere. Hyphens only.
- Only wire up automation the user confirmed. Never auto-enable without a clear yes.
- This skill is the one-time builder. The work lives in the skill it generates - re-run this only to build a different automation.
