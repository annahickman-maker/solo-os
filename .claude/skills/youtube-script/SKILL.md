---
name: youtube-script
description: Orchestrator skill that takes a raw video idea to a finished script through a 3-phase flow - interview, prompt sheet, optional full script. Phase 1 is a casual conversation that draws out the user's thinking, stories, value points, and context. Phase 2 produces the prompt sheet (intro/CTA/outro word-for-word, context and value as bullets) - 1-4 pages max, ready to film off-the-cuff. Phase 3 is optional full word-for-word scripting if the user wants it. Save and resume capable. Use when the user wants to script a video end-to-end, or says "run the script builder", "script this video", or "let's build the script".
---

# YouTube Script (Orchestrator)

Takes a raw video idea to a finished script through a 3-phase flow.

**Phase 1 - Interview.** A casual long conversation. Not rigid steps. The user thinks out loud. Claude guides them through the angle, transformation, value, stories, and proof - asking questions, pulling assets, surfacing things from the swipe file, listening. The output of this phase is enough information to produce a script outline.

**Phase 2 - The prompt sheet.** Claude goes away and comes back with a structured outline. Intro word-for-word. Context and value points as bullets. CTA word-for-word with suggested drop-in points. Outro word-for-word. 1-4 pages max. The user can read this and film off-the-cuff using the bullets as a guide.

**Phase 3 - Optional full script.** If the user wants to go further, Claude scripts the context section and each value section word-for-word. This is opt-in - many videos are filmed straight from the prompt sheet.

---

## Preflight

1. Read `04_YouTube/core_channel-positioning.md`. If missing, STOP: "Run /youtube-onboarding first to set up channel positioning."
2. Read `01_Core/core_voice-style.md`, `01_Core/core_audience.md`, `01_Core/core_positioning.md`, `01_Core/core_ip.md`, `01_Core/core_offer-suite.md`.
3. Check for an existing script project in `04_YouTube/Scripts/` matching the user's video. If one exists, load it and offer to resume from where they left off.

---

## Save and resume

This is a long workflow. Save aggressively.

After each significant chunk (interview complete, title locked, prompt sheet ready, full script done), save progress to `04_YouTube/Scripts/[slug].md` with:
- Everything captured so far
- Which phase the user is in
- What's next

If the user says "stop", "take a break", or "come back later":
1. Save progress
2. Tell them: "Saved. When you come back, just say **continue script** and I'll pick up at [next step]."

When they return and say "continue script":
1. Read `04_YouTube/Scripts/[slug].md`
2. Summarise what's locked
3. Resume from the next step

---

## PHASE 1 - The interview

This is a flowing conversation. Not rigid steps. Your job: ask questions, listen, dig deeper, clarify, surface relevant assets, and keep the conversation moving naturally until you have everything you need.

Ask one or two questions at a time. Never stack a list. Pull from the user's vault to prompt them.

### Before starting the interview

Scan for relevant material:
- `05_Assets/Stories/` - personal stories
- `05_Assets/POVs/` - developed POVs
- `05_Assets/Transcripts/` - existing content on this topic
- `06_Swipe/` - if anything is relevant, surface it during the interview with attribution (never use directly)

Read `01_Core/core_voice-style.md` so your draft language and prompts match the user.

### Open the interview

> "Let's build this script. I'm going to walk you through it like a conversation - I'll ask questions, you talk through your thinking, and I'll pull from your stories and POVs as we go. Don't worry about being structured - I'll handle that on the way out.
>
> What's the video idea?"

Wait for their answer. Then dig in.

### What you need to gather (in any order, follow the conversation)

**The idea and angle**
- What is the video about?
- What makes their take on this specific?
- Does it connect to the core method in `core_ip.md`? Note the connection.

**The desirable audience result**
- Cross-check with `core_channel-positioning.md` (transformation, where you're taking them).
- Is the raw idea framed as a desirable result, or does it need bridging? See /youtube-ideas Step 2 for the bridging logic.

**The transformation**
- Before / after for the viewer.

**Audience alignment**
- Cross-check with `core_audience.md`.
- Bonus: any demand signals (comments, DMs, community questions).

**The baseline belief**
The thing the viewer currently believes, assumes, or has been told. Three forms:
1. Common assumption that isn't quite right
2. Main objection the viewer has
3. Commonly given advice the user disagrees with

Ask:
> "When someone comes to this video, what's the main thing they currently believe or assume about this topic that isn't quite right? Or what's the objection - the reason they might think this won't work for them?"

**The contrarian flip**
What the user actually believes based on real experience. Must address the baseline belief directly.
- "What do you actually believe about this based on experience?"
- "What do most people get wrong about this?"

**Proof points**
The reason someone should trust the user on this topic. Pull from `05_Assets/Stories/` and `05_Assets/Transcripts/` during the conversation. If the user is struggling, ask about their experience to surface real proof.

**3-5 value points (the body of the video)**
For each: what is it, why does it matter, how does someone do it, common mistake.
- "Talk me through the actual content - what are the 3-5 things someone needs to know or do? Just explain it like you're telling a friend."
- Then ask follow-up questions to deepen each one.

**CTA**
Read `04_YouTube/core_channel-positioning.md` for the channel CTA. Confirm it applies:
- "Your channel CTA is [describe it]. Use that for this video, or different one?"

**Next video (for the outro)**
Scan `05_Assets/Transcripts/` and `04_YouTube/Archive/` for existing videos that would make a strong follow-up. If you find one, suggest it. If nothing fits, ask.

**Stories and personal experience**
As the conversation flows, listen for natural story moments. Bank anything new to `05_Assets/Stories/` immediately.

### Asset banking rule

Throughout the interview, every time the user shares something new, bank it immediately:
- Stories → `05_Assets/Stories/`
- POVs → `05_Assets/POVs/`
- Other people's ideas referenced → `06_Swipe/` with the original source

This grows the user's library so the next script is faster.

### How to conduct the interview

- Ask one or two questions at a time, never a list
- If an answer is vague, push for specifics: "Can you give me a concrete example?" / "What does that actually look like in practice?"
- If something contradicts what they said earlier, flag it: "Earlier you said [X], but now it sounds like [Y] - which is more accurate?"
- Pull from assets to prompt: "I found this POV in your vault - [brief description]. Does this connect?"
- Surface swipe-file material with attribution when relevant - never use directly
- Don't explain frameworks or scripting terminology unless the user seems confused
- Keep the energy conversational - this should feel like a productive chat, not a form

### When to move to Phase 2

Move to Phase 2 when you have:
- [ ] A specific angle (not a broad topic)
- [ ] A clear transformation (before/after)
- [ ] The desirable audience result this delivers
- [ ] The baseline belief
- [ ] The contrarian flip
- [ ] At least one strong proof point
- [ ] 3-5 value points with enough depth to outline
- [ ] CTA confirmed
- [ ] Next video for outro identified (or confirmed there isn't one)
- [ ] At least some stories or experiences noted for the value sections

If something is still weak or vague, keep asking. Don't move on.

When you're ready, tell the user:
> "I think I have everything I need. Let me put this together - I'll come back with your title options, then your prompt sheet (intro scripted, value as bullets, CTA scripted, outro scripted). Give me a moment."

Save the interview output to `04_YouTube/Scripts/[slug].md` before moving on.

---

## PHASE 2 - The prompt sheet

Goal: produce a 1-4 page document the user can read and film off-the-cuff. Intro/CTA/outro are word-for-word. Context and value sections are bullets.

### Step 1 - Title + thumbnail phrases

Hand off to /youtube-title. The skill runs the radar, generates 10 titles + 5 thumbnail phrases, and the user picks up to 3 of each for A/B testing.

Once locked, save to the project note.

### Step 2 - Build the structural outline

Hand off to /youtube-script-outline. This produces the bullet-point skeleton with placeholders for intro/CTA/outro (which we fill in next).

Once locked, save the outline structure.

### Step 3 - Write the intro (word-for-word)

Hand off to /youtube-script-intro. The user gets a 30-90 second intro that delivers the 3 Cs.

Once locked, save the intro to the project note. This replaces the intro placeholder in the outline.

### Step 4 - Write the CTA (word-for-word) + suggest drop-in points

Hand off to /youtube-script-cta. The user gets a 15-25 second mid-video CTA.

Then suggest drop-in points for the CTA - 1-2 places in the script where it would land naturally:
- After the most "implementation-heavy" value section
- Before a tool/template demo
- Right after a framework is taught

Save the CTA + suggested drop-in points to the project note.

### Step 5 - Write the outro (word-for-word)

Hand off to /youtube-script-outro. The user gets a 15-25 second outro pointing to a real next video.

Once locked, save the outro to the project note.

### Step 6 - Assemble the prompt sheet

Combine everything into the prompt sheet format:

```
# [Video title]

## Intro (word-for-word)

[Full intro text - 30-90 seconds]

---

## Context section (bullets)

- [Mirror their situation]
- [What's not working]
- [The AHA / contrarian flip]
- [What to do instead]
- [Why this works better]
- [Bridge into value]

(Or "Skipped - intro already does the work" if Mode A from /youtube-script-context)

---

## Value sections (bullets)

### 1. [Point name]
- WHY: [why this matters]
- WHAT: [the insight]
- HOW: [how to apply - bullet the steps/examples]
- PAYOFF + REHOOK: [the takeaway + bridge into next]
- Story: [story to tell here, if any]

### 2. [Point name]
(same structure)

(continue for all value points)

---

## CTA (word-for-word) - drop in here:

Suggested drop-in points:
1. [After value section X]
2. [Optional second drop-in: after value section Y]

[Full CTA text - 15-25 seconds]

---

## Outro (word-for-word)

[Full outro text - 15-25 seconds]

---

## Estimated spoken length
[X minutes - calculated from word count of the locked sections + estimated bullet expansion]
```

Save as the final prompt sheet to `04_YouTube/Scripts/[slug].md`.

### Step 7 - Present the prompt sheet and ask for feedback FIRST

Before asking about full scripting, get feedback on what's there. Don't skip this step.

> "Here's your prompt sheet:
>
> [present the assembled prompt sheet]
>
> Before we go further, take a look:
>
> - **Does the title feel right?** Or want to revisit it?
> - **Anything in the intro feel off?** Tone, opener, the proof point used?
> - **Are the value sections covering the right things in the right order?** Anything missing or out of sequence?
> - **Does the CTA placement feel natural?** Different drop-in point?
> - **Outro link - is that the right next video?**
> - **Is the overall direction right?** Anything you'd reframe?"

Wait for their feedback.

If they want to adjust a specific section, route them to that section's skill:
- Title issue → re-run /youtube-title (or just refine the existing one)
- Intro issue → re-run /youtube-script-intro
- CTA issue → re-run /youtube-script-cta
- Outro issue → re-run /youtube-script-outro
- Outline / value points missing or wrong order → revisit the outline together

Loop on feedback until they're happy with the prompt sheet. Don't move on until they say it's right.

### Step 8 - Now ask about full scripting

Once the prompt sheet is approved:

> "Prompt sheet locked. Two options from here:
>
> 1. **Take this and go film** - read the intro/CTA/outro word-for-word, speak the value sections off-the-cuff using the bullets as your guide
> 2. **Script the rest word-for-word** - I'll write the context section and each value section in full
>
> Which?"

STOP - wait for their choice.

If option 1, save the prompt sheet as the final output and hand off (skip to closing).

If option 2, continue to Phase 3.

---

## PHASE 3 - Optional full word-for-word scripting

Only run if the user opted in.

### Step 1 - Context section

Hand off to /youtube-script-context. The skill picks Mode A (skip), B (light setup), or C (full mindset shift) based on judgment.

Once locked, replace the context bullets in the project note with the word-for-word content.

### Step 2 - Each value section

For each value point in the outline:
1. Hand off to /youtube-script-value with the teaching point, position in video, what comes next
2. Wait for the section to be locked
3. Replace the value bullets in the project note with the word-for-word content
4. Move to the next value point

The last value section's rehook bridges into either the CTA or the outro - tell /youtube-script-value which.

### Step 3 - Final assembly

Combine all the word-for-word sections in order. Save as the full script in `04_YouTube/Scripts/[slug].md`, replacing the prompt-sheet version.

Calculate total spoken length from word count (~150 words/minute spoken).

---

## Closing hand-off

Whether the user stopped at the prompt sheet or went all the way to a full script, close with:

> "Your script is ready - saved to `04_YouTube/Scripts/[slug].md`. Estimated spoken length: [X] minutes.
>
> When you film this video, drop the transcript back in chat afterwards and /youtube-post-film will:
> - Save the transcript to `04_YouTube/Transcripts/`
> - Move this script to `04_YouTube/Archive/`
> - Update your voice style with any new patterns
> - Generate the YouTube description
>
> Anything else you want to adjust before you go film?"

---

## Project note structure

```markdown
---
type: project
slug: [video-slug]
status: interview | prompt-sheet | full-script | filmed
tags:
  - type/project
  - domain/youtube
aliases:
  - [Video title]
---

# [Video title]

## Status
[interview / prompt-sheet / full-script / filmed]
Phase: [1 / 2 / 3]
Next step: [step name]

## Interview output
[All info gathered in Phase 1: idea, angle, transformation, baseline belief, contrarian flip, proof, value points, CTA decision, next video, stories]

## Title (locked)
[the title]

## Thumbnail phrases (top 3)
[from /youtube-title]

## Prompt sheet
[The assembled prompt sheet from Phase 2 Step 6]

## Full script (if Phase 3 was run)
[Word-for-word version with context and value sections scripted]

## Estimated spoken length
[X minutes]
```

---

## Rules

- This skill is an orchestrator. It does not write content directly. It calls the section skills.
- Phase 1 is a CONVERSATION, not a form. Don't ask questions in a list. Follow the natural flow.
- Always bank stories, POVs, and external references during the interview.
- Save aggressively after each phase.
- Always name what's coming next when handing off to a section skill (so rehooks and bridges land properly).
- The prompt sheet is the default deliverable. Phase 3 is opt-in.
- Never invent content. If a section skill returns "needs user input," go back to the user.
- Voice rules from `core_voice-style.md` apply throughout.
- Never use - (em dash). Use - instead.
