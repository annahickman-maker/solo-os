---
name: client-strategy-summary
title: Client Strategy Summary
card: Turn a client strategy call into a recap email draft
description: 'Turns a new client strategy call recording into a ready-to-send recap email - what you landed on, the open question, what they should sit with, your action items - saved to your client transcripts and drafted in Gmail with a Telegram ping. Runs on its own when a new strategy call recording lands, or on demand. Use when the user wants to write up a client or strategy call, or says "process the strategy call".'
category: Clients
inputs:
  - type: transcript
    multiple: true
    optional: true
  - type: client
    optional: true
outputs:
  - type: inbox
    description: the recap email, also drafted in Gmail
schedule:
  trigger: event
  event: new-zoom-recording
  output: a recap email draft in Gmail + the markdown in your client transcripts
  enabled: true
icon: clients
color: '#C98AE6'
knowledge: 05_Assets/Transcripts/Client-Calls/, 01_Core/core_voice-style.md
---

# Client Strategy Summary

One job: turn a client / strategy call into a ready-to-send recap email to the other person. Runs on its own when a new strategy recording lands, or on demand. You paste the Zoom share link in, review, and send.

## Get the transcript

If a transcript was handed to this run, use it. If it fired with nothing provided, pull the latest strategy recording from Zoom: `search_meetings` for recent recordings with `has_recording: true`, then `get_recording_resource` with `types: "transcript"` (skip video and audio). Read in chunks if large.

Self-guard on the topic: this skill is only for client / strategy calls (a focused conversation between you and one other person). If the latest recording is a Q&A / community call (topic contains `q&a`, `community call`, `office hours`, or several attendees asking questions in sequence), leave it - this skill is not for those. If the transcript is empty or still processing, stop and leave it for next run.

## Write the recap

Output to `05_Assets/Transcripts/Client-Calls/{Name} call {Nth} of {Month}.md` (the other person's first name; current-year files omit the year, past years include it). Match `Client C call 12th of June.md`:

```markdown
---
type: asset
slug: strategy-call-YYYY-MM-DD-<topic-slug>
status: active
tags:
  - type/asset
  - domain/strategy-call
  - domain/transcript
  - format/email-draft
---

# Strategy Call - <Meeting Topic> - Month Day, Year

**To:** <recipient first name>
**Subject:** <short, specific, no hype>

---

Hi <name>,

<one-line opener that frames the email as a recap of the call>

**What we landed on:**

- <bullets - concise, plain language, the things actually decided or aligned on>

**The big open question:** (only if there is one)

<one short paragraph naming the unresolved thing and how you are going to resolve it>

**Things I want you to sit with before next call:**

- <2-4 bullets the recipient needs to think about>

**My action items:**

- <what you are doing before next call>

If you want to re-watch the call before we talk again, here's the recording: [paste Zoom share link]

<warm closing line - scheduling note, sign-off>

the creator

---

## Full Transcript

See [{Name} call {Nth} of {Month} (raw).md](<raw/{Name} call {Nth} of {Month} (raw).md>)
```

Save the raw transcript to `05_Assets/Transcripts/Client-Calls/raw/{Name} call {Nth} of {Month} (raw).md` using `jq -r '.transcripts[0].timeline[] | "[\(.ts)] \(.display_name): \(.text)"'`. Always keep the literal `[paste Zoom share link]` placeholder - the Zoom MCP only returns expiring direct-MP4 URLs, so you paste the share link from the Zoom dashboard before sending.

## Gmail draft + Telegram ping

After writing the markdown file, also:

1. **Create a Gmail draft** via `create_draft`:
   - `to: ["hello@yourdomain.com"]` (your own address as placeholder - swap in the real recipient before sending; Gmail rejects an empty To)
   - `subject:` the same subject line from the markdown
   - `body:` the plaintext email body (everything between the H1's `---` divider and the `the creator` sign-off). Convert `**bold**` headers to plain text with a colon, keep the bullet `-` characters, keep `[paste Zoom share link]` literal.

2. **Append a line** to `/tmp/zoom-notify.txt` (create if missing, append if multiple in one run):
   `New strategy call recap drafted: <Meeting Topic> (<Month Day>). Open Gmail Drafts to fill in recipient and send.`
   The runner reads this after the skill exits and posts it to Telegram.

Show the finished recap in the chat too.

## Rules

- Read `01_Core/core_voice-style.md` first. Direct second person ("you"), your voice, concise bullets, no hype, no guru language.
- No em dashes anywhere. Hyphens only.
