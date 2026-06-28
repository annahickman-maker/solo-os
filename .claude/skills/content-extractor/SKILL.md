---
name: content-extractor
description: Mine transcripts for distinct ideas that you can save to your bank or queue as content
title: Idea Extractor
card: Mine your transcripts for distinct ideas to use in your content
category: Ideas
inputs:
  - type: transcript
    multiple: true
---

# Idea Extractor

Mine your transcripts for distinct, reusable ideas. This is a starting point: it surfaces the ideas worth keeping, helps you shape them, and saves or queues them ONLY when you ask. It never saves automatically.

(The automatic transcript extraction with save buttons in your vault is a separate dashboard feature and still works as before. This skill is the conversational version you run yourself.)

## Required vault data

Read these for context. Skim what's there; don't hard-error if one is missing.

- `01_Core/core_voice-style.md` - so ideas and verbatim lines stay in your voice
- `01_Core/core_audience.md` - who each idea has to land for
- `01_Core/core_my-story.md` - skim, for matching stories and anecdotes
- Existing banks, so you don't re-surface ideas already saved: `00_System/micro-stories.json`, `00_System/teaching-frameworks.json`, `00_System/proof-points.json`, and the POV titles in `05_Assets/POVs/`

## Workflow

### Step 1 - Load context

Read the files above. Skim the existing banks so you don't surface ideas that are already saved.

### Step 2 - Read the transcript(s)

Single file: read it fully. Folder or batch: list the files and work through each (ask which subset if there are more than 5).

### Step 3 - Find the ideas

Pull distinct, self-contained ideas. Shapes worth keeping:

- a claim + its reasoning (a POV)
- a framework or step-by-step method
- a story or anecdote with a clear takeaway
- a proof point, result, or data receipt
- a hot take or contrarian flip
- a before-and-after moment

Preserve strong VERBATIM lines - the user's phrasing is the signal. Skip filler, anything that needs 3+ paragraphs of setup to land, and anything already in the banks.

### Step 4 - Present the ideas (the starting point)

Show a numbered list. This is where the conversation starts: the user picks what's worth keeping and you develop it together. Nothing is saved yet.

```
1. Idea: <one-line summary>
   Type: story | framework | proof | POV
   Source: <transcript>, around <rough location>
   Strong verbatim: "<exact line>" (if any)

2. ...
```

### Step 5 - Develop, then save or queue ON REQUEST

Help shape the ideas the user wants to keep. Save or queue ONLY when they ask - never on your own. When they ask, route each idea to the right place:

- story / anecdote -> append to `00_System/micro-stories.json`
- framework / method -> append to `00_System/teaching-frameworks.json`
- proof / result / data -> append to `00_System/proof-points.json`
- POV / claim / hot take -> a POV note at `05_Assets/POVs/asset_pov-<slug>.md`
- "make this a video / post" -> queue to the YouTube queue (`04_Channel/04_Projects/project_<slug>.md`, `status: idea`) or the Instagram queue (`00_System/instagram-queue.json`)

For the JSON banks: read an existing entry FIRST to match its exact shape (`id`, `text`, `title`, `context`, `source_transcript`, `source_timestamp`, `tags`, `created_at`), then append your new entry. Never overwrite the file.

### Step 6 - Report

After any save, confirm in one line what went where.

## Hard rules

- Never auto-save. Saving and queuing are always on request.
- No em dashes anywhere. Hyphens only.
- Verbatim lines are gold - keep the user's exact phrasing.
- Ideas and voice come from the user's own files and transcript, never fabricated.
- Dedupe against the existing banks before surfacing an idea.
