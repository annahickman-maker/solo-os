---
name: skool-qa-post
title: Skool Q&A Post
card: Turn a Q&A call recording into a community post
description: 'Turns a new Skool Q&A or community call recording into a ready-to-paste community post - a one-line context plus skimmable bolded-question bullets that mirror how each question actually went - saved to your Q&A transcripts and surfaced in your inbox. Runs on its own when a new Q&A call recording lands, or on demand. Use when the user wants to write up a Q&A or community call, or says "process the Q&A call".'
category: Clients
inputs:
  - type: transcript
    multiple: true
    optional: true
outputs:
  - type: inbox
    description: the Q&A community post
schedule:
  trigger: event
  event: new-zoom-recording
  output: a Q&A community post saved to your inbox
  enabled: true
icon: copy
color: '#16C97E'
knowledge: 05_Assets/Transcripts/QA-Calls/, 01_Core/core_voice-style.md
---

# Skool Q&A Post

One job: turn a Q&A / community call into a community post in the exact format below. Runs on its own when a new Q&A recording lands, or on demand from the run panel.

## Get the transcript

If a transcript was handed to this run, use it. If it fired with nothing provided, pull the latest Q&A recording from Zoom: `search_meetings` for recent recordings with `has_recording: true`, then `get_recording_resource` with `types: "transcript"` for the Q&A one (skip video and audio - calls are filmed on OBS). Read in chunks if the transcript auto-saves to a tool-results file.

Self-guard on the topic: this skill is only for Q&A / community calls (topic contains `q&a`, `qa`, `community call`, `office hours`, or the first ~500 words are several attendees asking questions in sequence). If the latest recording is a focused two-person strategy call, leave it - that is `client-strategy-summary`'s job. If the transcript is empty or still processing, stop and leave it for next run.

## Write the post

Output to `05_Assets/Transcripts/QA-Calls/Skool Q&A {Nth} {Month}.md`. Current-year files omit the year; past years include it (e.g. `Skool Q&A 16th December 2025.md`). Match `Skool Q&A 24th June.md` exactly:

- Frontmatter: `type: asset`, `slug: skool-qa-YYYY-MM-DD`, `status: active`, tags `type/asset`, `domain/community`, `domain/transcript`, alias `Skool Q&A YYYY-MM-DD`
- H1: `Skool Q&A - Month Day, Year`
- **Attendees:** line - names pulled from the transcript speakers
- **Community Post** section: opens with `Q&A Recording [Day DD Mon]`, then a one-line context sentence framing the session, then `Here's a summary of what we covered:` is not needed - go straight to the bullets. Each bullet is a **bolded question** the way a member would ask it, then 2-4 short sentences answering it the way the group actually landed it: the situation, the friction, and what to do. ~50-60 words per bullet. Skimmable at a glance. Quote real phrases from the transcript where they punch; never invent claims or numbers.
- **Full Transcript** section: link to the raw file (below), do not paste inline.

Save the raw transcript to `05_Assets/Transcripts/QA-Calls/raw/Skool Q&A {Nth} {Month} (raw).md` and link to it from the Full Transcript section. Convert the JSON timeline to plaintext with `jq -r '.transcripts[0].timeline[] | "[\(.ts)] \(.display_name): \(.text)"'`.

Show the finished post in the chat too, so it can be copied straight into Skool.

## Rules

- Read `01_Core/core_voice-style.md` first. No hype, no guru language. All-lowercase is fine in casual phrasing.
- No em dashes anywhere. Hyphens only.
