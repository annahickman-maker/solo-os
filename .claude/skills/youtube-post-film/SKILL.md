---
name: youtube-post-film
description: 'Post-filming workflow that auto-triggers when the user drops a YouTube transcript in chat. Saves the transcript to 04_YouTube/Transcripts/, observes new voice patterns and updates 01_Core/core_voice-style.md, moves the corresponding script from 04_YouTube/Scripts/ to 04_YouTube/Archive/, and generates a complete YouTube description by calling /youtube-description. Use whenever a YouTube transcript is dropped in chat with no other context, or when the user asks to "process this transcript" or "I just filmed this".'
category: Create
hidden: true
---

# YouTube Post-Film

The agent that handles everything after the user films a video. Triggered when a transcript drops in chat.

What it does in order:
1. Save transcript to `04_YouTube/Transcripts/`
2. Observe new voice patterns and update `01_Core/core_voice-style.md`
3. Move the corresponding script from `04_YouTube/Scripts/` to `04_YouTube/Archive/`
4. Generate the YouTube description by calling /youtube-description (which also mints the per-video tracking slug and updates the link manifest)
5. Surface the manifest deploy command so the new tracking link goes live before publish
6. Return everything to the user, ready to paste

---

## Preflight

1. Read `01_Core/core_voice-style.md` (set up in Solo OS onboarding). If your core files aren't set up yet, stop and say: run /solopreneur-onboarding first.

---

## Trigger

This skill triggers when:
- The user drops a YouTube transcript directly in chat (with or without explicit instruction)
- The user says "process this transcript", "I just filmed this", "here's the transcript from [video]"
- The user explicitly runs /youtube-post-film

If a transcript drops with no context AND there's no obvious other intent, default to running this skill.

---

## Required inputs

Confirm before processing. If missing, ask.

- The full transcript (text, with timestamps if possible)
- The video title (so we can match it to the script in `04_YouTube/Scripts/` and apply UTM tagging in the description)

If the user didn't specify which script this transcript matches, look in `04_YouTube/Scripts/` for a recently in-progress or locked script that matches the title or topic. If multiple match, ask the user to confirm which.

---

## Step 1 - Save the transcript

Save to `04_YouTube/Transcripts/transcript_[slug].md` (slug = 2-3 words from the title, lowercase, hyphens).

File structure:

```markdown
---
type: asset
slug: transcript-[slug]
status: active
tags:
  - type/asset
  - domain/youtube
aliases:
  - "Transcript: [video title]"
date_filmed: [today's date if known, otherwise leave blank]
---

# Transcript: [Video title]

[Full transcript content]
```

Tell the user: "Transcript saved to `04_YouTube/Transcripts/transcript_[slug].md`."

---

## Step 2 - Observe and update voice style

Read the transcript. Compare against patterns in `01_Core/core_voice-style.md`.

Look for:
- New recurring phrases or expressions
- Sentence rhythm patterns (run-on / fragmented / mixed)
- New tone markers
- New ways of opening or transitioning
- Words used in fresh ways
- Anything that confirms or contradicts existing patterns

If you find new patterns:
- Append them to the relevant section of `core_voice-style.md` with a date stamp and source ("From transcript: [video title]")
- Don't duplicate existing patterns
- If something contradicts an existing pattern, surface it to the user: "I noticed in this transcript you said [X] which is different from your saved pattern of [Y]. Update the saved pattern, or treat this one as a one-off?"

Tell the user briefly what you updated:
> "Voice style updated with [N] new patterns from this transcript:
> - [pattern 1]
> - [pattern 2]"

If nothing new, say so:
> "Voice style is consistent with what's already saved. No new patterns to log from this transcript."

---

## Step 3 - Archive the script

Find the corresponding script in `04_YouTube/Scripts/`. The match is by slug (same as transcript slug) or by title.

Move it to `04_YouTube/Archive/[slug].md`. Use `mv` so git history is preserved if the vault is under git.

Update the frontmatter on the moved file:
- Change `status: locked` → `status: filmed`
- Add `date_filmed: [today's date]`

If no matching script exists in `04_YouTube/Scripts/` (e.g., the user filmed without running /youtube-script first), skip this step and tell the user:
> "No matching script found in `04_YouTube/Scripts/`. Skipping the archive step."

If multiple scripts match, ask the user to confirm which one before moving.

Tell the user:
> "Script moved to `04_YouTube/Archive/[slug].md` and marked as filmed."

---

## Step 4 - Generate the description

Hand off to /youtube-description. Pass:
- The transcript (as the source content)
- The finalised video title
- Note that the transcript is already saved (so the description skill doesn't have to ask for it)

The description skill will:
- If conversion tracking is set up, mint a per-video tracking slug and add it to `scripts/link_manifest.json` (in the vault), and use the member's `<tracking-base>/go/<slug>` as the CTA link. If tracking isn't set up, use the raw channel CTA link and skip the manifest.
- Produce CTA + 2-sentence hook + chapters + final assembled description
- Return the manifest update block (slug, destination, deploy command) only when tracking is set up

When it returns, present the description to the user.

---

## Step 5 - Surface the deploy reminder (only if a tracking link was minted)

Skip this step entirely if conversion tracking isn't set up (no manifest entry was made). Otherwise the manifest has a new entry but Cloudflare doesn't know about it yet. Tell the user:

> "A new tracking link was added to the manifest for this video. Deploy it to Cloudflare before publishing:
>
> ```
> cd 03_Projects/agents/worker && npm run deploy
> ```
>
> After deploy, test the link by visiting `<tracking-base>/go/<slug>` in a browser - confirm it redirects to the right destination - then publish the video."

If the user wants, they can run the deploy command themselves. Don't auto-run it.

---

## Step 6 - Return everything to the user

Final output to user:

> "Post-film flow complete. Here's what I did:
>
> 1. ✓ Transcript saved -> `04_YouTube/Transcripts/transcript_[slug].md`
> 2. ✓ Voice style updated -> [N new patterns / no new patterns]
> 3. ✓ Script archived -> `04_YouTube/Archive/[slug].md` (status: filmed)
> 4. ✓ Description generated (below)
> 5. ✓ Tracking link added to manifest -> `<tracking-base>/go/[slug]` (deploy before publish: `cd 03_Projects/agents/worker && npm run deploy`) - only if conversion tracking is set up
>
> ---
>
> **Description:**
>
> [paste the full description from /youtube-description here]
>
> ---
>
> Anything to adjust on the description before you publish?"

---

## Rules

- This skill auto-triggers on transcript drop. Don't ask "would you like me to do this?" - just do it, then report what was done.
- Always do all 6 steps in order. Don't skip step 2 (voice update) just because the transcript looks consistent - even small pattern observations compound over time.
- If a script can't be matched, do the other steps and tell the user about the missing match.
- Generate the description by calling /youtube-description, don't write it directly. The description skill knows the rules - including the tracking slug + manifest update.
- Never auto-run the worker deploy. Always surface the command and let the user run it.
- Never use - (em dash). Use - instead.
