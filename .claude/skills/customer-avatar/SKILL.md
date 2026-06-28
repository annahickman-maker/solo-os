---
name: customer-avatar
description: 'Build a new, deeply detailed customer avatar and save it to your avatar bank so it shows up on your offer page under Avatars. Pulls from real call transcripts you select, plus anything you type in the describe box, plus a guided question set (the audience questions from onboarding, expanded) to fill the avatar out as richly as the the avatar example - who they are, their daily reality, fears, objections, what motivates them, and the exact language they use. Use when the user wants to build a new customer avatar, add an avatar to their bank, or map a specific segment of their audience.'
title: Customer Avatar
card: Build a detailed customer avatar and save to your avatar bank
category: Strategy
inputs:
  - type: transcript
    multiple: true
    optional: true
  - type: text
    optional: true
icon: clients
color: '#C98AE6'
knowledge: '05_Assets/Avatars/avatar-the-avatar.md, .claude/skills/solopreneur-onboarding/phase-2-audience.md, 01_Core/core_audience.md'
---

# Customer Avatar

Build one new customer avatar, in real depth, and save it to the avatar bank so it appears on the offer page under Avatars. The bar is the the avatar example (`05_Assets/Avatars/avatar-the-avatar.md`) - match that level of detail.

This is a coaching conversation, not a form. One question at a time. Never invent traits - draw them from the transcripts, the describe box, and the user's answers. Pull real, verbatim quotes wherever you can.

## Before you start

- Read `05_Assets/Avatars/avatar-the-avatar.md` if it exists - the format and depth to match.
- Read the audience question set in `.claude/skills/solopreneur-onboarding/phase-2-audience.md` - reuse those questions, expanded for the avatar-specific sections below.
- If `01_Core/core_audience.md` exists, read it for the primary-audience context (this avatar may be a sibling or a narrower segment).

## Step 1 - Read what they brought

The setup box has two things: a transcript picker (as many real calls with people who represent this avatar as they want) and a free-text describe box. Read every transcript selected and whatever they typed. Mine it all for who this person is, their day-to-day, the language they use (desire and problem), their fears and objections, what motivates them, and how they decide. Collect verbatim quotes - they become the "How They Talk" section and sharpen everything else. If they brought nothing, build it from the conversation alone.

## Step 2 - Name the avatar

Ask what to call this person (a real client's first name, or a stand-in). Use that name throughout.

## Step 3 - Fill the picture (one question at a time)

Lead with what the transcripts and describe box already told you - present what you found, ask the user to confirm or correct, then probe the gaps. Cover, at minimum:

- Who they are - background, situation, where they are right now
- Their daily reality around the problem - the texture, what they're doing, avoiding, feeling
- What they're trying to do - the result they want, in their words
- Their limiting mindsets - what keeps them stuck
- Desire language - verbatim phrases for what they want
- Problem language - verbatim phrases for the pain
- Their fears
- Their objections - and the reframe for each
- What actually motivates them
- How they make decisions
- The content that would land with them, and what wouldn't

Push for specifics and real quotes, never the polished version. Confirm as you go.

## Step 4 - Write the avatar

Synthesize everything into `05_Assets/Avatars/avatar-<slug>.md`, matching the structure and depth of `avatar-the-avatar.md`. Use the pronoun that fits the person (She / He / They) consistently.

Frontmatter:

    ---
    type: core
    slug: avatar-<slug>
    status: active
    tags:
      - type/core
      - domain/audience
    aliases:
      - <Name> Avatar
    ---

These headings are load-bearing - the offer page reads them to fill each avatar card, so include them exactly (with the person's pronoun):

- `## Who [They] Are` - first paragraph is the one-line identity
- `## What [They] Are Trying to Do`
- `## [Their] Daily Reality`
- `## How [They] Talk About [Their] Situation` - the verbatim quotes
- `## [Their] Fears`
- `## [Their] Objections`
- `## What Actually Motivates [Them]`
- `## [Their] Decision-Making Pattern`
- `## Content That Would Land With [Them]`
- `## Talking to <Name>`
- `## Source Transcripts` - the transcripts and notes you pulled from

## Step 5 - Confirm

Tell the user it's saved and now in their avatar bank, on the offer page under Avatars. Show the finished avatar in the chat so they can read it. Offer to refine any section.

## Rules

- Never invent traits, quotes, or numbers. Everything comes from the transcripts, the describe box, or the user.
- Verbatim quotes wherever possible - they are the most valuable part.
- One question at a time. Warm, human, specific.
- No em dashes anywhere. Hyphens only.
