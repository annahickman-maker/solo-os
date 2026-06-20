---
name: process-zoom-transcript
description: Turn a Zoom transcript already in the vault into a structured output - a summary, a community recap, an action-item list, or a follow-up email draft. Use when the user wants to "process this Zoom transcript", "summarise yesterday's call", "draft a recap email from the call", or "extract action items from the meeting". This skill works on transcripts the dashboard's Zoom sync has already dropped into 05_Assets/Transcripts/<category>/ - it does not connect to Zoom itself. To set up the auto-sync, use /connect-zoom-transcripts first.
---

# Process Zoom Transcript

Companion to the dashboard's automatic Zoom sync. The sync drops raw transcripts into the vault; this skill helps the user turn one of those transcripts into a useful output.

The skill is OUTPUT-AGNOSTIC by design. The user picks what they want from the call - a summary, a recap email, action items, key topics, or a hybrid. The skill does not assume a destination (no specific community platform, no specific email client).

## When this fires

Triggered by phrases like:
- "process the Zoom call from yesterday"
- "summarise this transcript"
- "draft a follow-up email from this call"
- "pull the action items from the meeting"
- "give me a community recap post from this Q&A"

## Inputs

- **A transcript file** the user points to OR the most recent file in `05_Assets/Transcripts/`. If multiple recent files exist and the user didn't specify, list the 5 most recent (filename + date) and ask which one.
- The transcript file is markdown with a frontmatter block (added by the Zoom sync). Frontmatter fields you can use:
  - `topic` - meeting topic
  - `recorded_on` - date
  - `duration_minutes`
  - `call_type` - one of `qa`, `workshop`, `client`, `untagged` (the user may have re-classified from the Vault page)
  - `speakers` - list of names extracted from the VTT
- The transcript itself is `[mm:ss] Name: text` lines below the frontmatter.

If the file doesn't exist, tell the user the Zoom sync hasn't dropped it yet (or they need to set up the sync with /connect-zoom-transcripts).

## Step 1 - Ask what they want from the call

Show the user the options. Default to the option suggested by `call_type` from the frontmatter:

- **`qa`** -> default to community recap post (bullets summarising what came up + suggestions landed on)
- **`workshop`** -> default to teaching-points summary (key insights + structure)
- **`client`** -> default to follow-up email draft to the other attendee
- **`untagged`** -> ask: "I see this is untagged. What would you like? A summary, an email draft, action items, or community bullets?"

Always allow the user to override the default - they may want all four, or something else.

## Step 2 - Read the transcript

Open the file, parse the frontmatter, separate from the body. The transcript can be long (50KB+). If it doesn't fit in context, read the first ~60KB and the last ~10KB and tell the user "I'm working from the opening + closing of the transcript - if there's a key moment in the middle you want me to focus on, point me to a timestamp."

## Step 3 - Generate the requested output

### Summary

3-6 paragraphs, plain prose. Covers what was discussed, what was decided, what remains open. No bullets unless there are clear lists of items. Skip filler ("we got started", "we caught up").

### Community recap post (QA default)

Bullets, one per topic that came up. Each bullet follows: who brought it -> what their friction was -> what the group landed on. 2-3 sentences per bullet, ~50-60 words. Skimmable but the rhythm has to land. Quote real phrases from the transcript when they punch; never invent claims or numbers.

Output structure:
```
**Q&A Recording <date>**

<one-line context: who was on, topic theme>

Here's a summary of what we covered:

- <bullet 1>
- <bullet 2>
- ...
```

### Action items list

Bulleted, format `<name>: <action>`. Pull only commitments people actually made. Skip vague intentions ("I should look into that").

### Follow-up email draft (client default)

Plain email body, ready to paste into the user's email client. Don't assume a specific email service - the user decides where it goes.

Structure:
- Greeting + one-line opener acknowledging the call
- **What we landed on:** 3-6 plain-prose bullets of decisions/alignments
- **Open question:** one short paragraph (only if there is one)
- **Things to sit with before next call:** 2-4 bullets for the recipient
- **My action items:** 2-4 bullets for the user
- Closing line (scheduling note + warm sign-off)
- Use the placeholder `[paste link to recording here]` if the user might want to attach it - the dashboard sync doesn't have the Zoom share link, only the meeting topic.

### Teaching-points summary (workshop default)

Headers per main teaching point. Under each: the core idea (1-2 sentences), the example or story used (1 sentence), and the audience takeaway. Capture the WHY behind each point, not just the WHAT.

## Step 4 - Save the output

Default save location: same folder as the source transcript, with `_<output-type>.md` appended to the source filename. Example:
- Source: `05_Assets/Transcripts/Client-Calls/zoom-2026-06-19_strategy-with-alice.md`
- Output: `05_Assets/Transcripts/Client-Calls/zoom-2026-06-19_strategy-with-alice_email-draft.md`

Add a frontmatter:
```
---
type: output
source_transcript: <filename of the source>
output_type: summary | recap | action-items | email-draft | teaching-points
generated_on: <today's date>
---
```

If the user asked for multiple outputs in one go, save each as a separate file.

## Step 5 - Surface the output

Tell the user the path of each saved file and paste the key part inline (the email body, the summary, the bullets) so they can read it without opening the file.

## Voice rules

Read `01_Core/core_voice-style.md` before drafting any output that uses the user's voice (email drafts especially). If voice-style hasn't been filled in (sample-vault stub), default to plain, direct, no-hype tone. Never em dashes - use plain hyphens.

## Failure modes

- **No transcript file at the path the user gave.** Check the four `05_Assets/Transcripts/` subfolders for files matching the date or topic. If none found, ask if they ran `/connect-zoom-transcripts` and whether the dashboard has synced yet.
- **Transcript exists but is empty / only frontmatter.** Zoom is still processing the transcript on their side; ask the user to wait 15-30 minutes after the call ends and try again.
- **Multiple transcripts match the user's request.** List the candidates by filename + date and ask which one.
- **User wants an output type not listed here.** Ask them to describe the structure they want; generate it.
