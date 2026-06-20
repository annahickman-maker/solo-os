---
name: youtube-script-outro
description: Write the closing outro section of a YouTube script. Uses the Reinforce Transformation / Curiosity Gap / Next Video structure to keep viewers on the channel rather than clicking off. Identifies the natural next video from the user's existing content. Short and tight - the moment people realise the video is ending, they click away. Use when the user is scripting an outro, or when called by /youtube-script orchestrator at the end of the script.
---

# YouTube Script Outro

Writes the closing outro of the video. The job: keep them on the channel. As soon as people realise the video is ending, they click off - the outro must redirect that energy into another video before the click happens.

---

## Preflight

1. Read `04_YouTube/core_channel-positioning.md`. If missing, STOP: "Run /youtube-onboarding first to set up channel positioning."
2. Read `01_Core/core_voice-style.md`.
3. Scan `05_Assets/Transcripts/` to find existing videos that would make a strong follow-up. Also check `04_YouTube/Archive/` for archived scripts that have been published.

---

## Required inputs

Confirm before drafting. If missing, ask.

- The video's transformation (so the reinforce beat lands)
- What the video covered at a high level (so the curiosity gap is grounded)
- The next video to send people to - either:
  - Pulled from `05_Assets/Transcripts/` if a relevant follow-up exists
  - Or the user names the video they want to direct viewers to
- If no obvious next video exists, ASK the user before drafting - don't invent one

---

## The 3 beats of an outro

Each beat is 1-2 sentences. Whole outro is 15-25 seconds spoken.

### 1. REINFORCE TRANSFORMATION
One line. Recap what the viewer just learned, framed as what they can now do.

Frameworks:
- "After implementing everything in this video, you'll have [specific capability]."
- "Now you've got [the framework], you can [specific result]."
- "[Specific outcome] is now possible for you, because you know how to [thing they learned]."

Example:
> "After implementing everything in this video, you'll have everything you need to turn your YouTube channel into a 24/7 sales machine for your business."

### 2. CURIOSITY GAP
Highlight what's still missing - the thing that makes the next video the obvious next step. This is what stops the click-off.

Frameworks:
- "But of course - this is only going to work if you also have [the next thing]."
- "There's one piece I haven't covered though, which is [the thing]."
- "If you don't [next-video topic], all of this falls apart."

Example:
> "But of course - this is only going to work if you have an offer to send people to that is perfectly aligned with your content and the audience you are attracting."

### 3. NEXT VIDEO
Position the next video as the essential follow-up.

Frameworks:
- "And so this is exactly what I help you do in this video here."
- "I made a whole video on this - [link to it / point to it]."
- "Watch [next video title] next - it picks up exactly where this leaves off."

Example:
> "And so this is exactly what I help you do in this video here."

---

## How to run the skill

One-shot only. The outro is 15-25 seconds spoken - too short to be worth walking through beat-by-beat.

1. Confirm required inputs (especially the next video) - if anything is missing, ask
2. Read all required files + scan `05_Assets/Transcripts/` for the next video if not provided
3. Draft the outro as flowing narrative
4. Run the self-check
5. Present per the output format

The user can edit or ask for variations after seeing the draft.

---

## Output format

```
[full outro as flowing narrative - 15-25 seconds spoken]

---

**3-beat breakdown:**
- Reinforce transformation: [the sentence that does this job]
- Curiosity gap: [the sentence(s) that do this job]
- Next video: [the sentence pointing to the next video]

**Next video pointed to:** [video title]
**Why this is the right follow-up:** [one line - the curiosity gap this video resolves]
```

---

## Hard rules

1. **Voice overrides framework.** Match `core_voice-style.md`.
2. **Never invent a next video.** Pull from `05_Assets/Transcripts/` or ask the user. Linking to a video that doesn't exist breaks viewer trust.
3. **Keep it short.** 15-25 seconds spoken. The outro is not the place for one more lesson.
4. **The curiosity gap must be specific to the named next video.** If the gap is generic ("there's so much more to learn"), the next video won't feel essential.
5. **Never use em dashes.** Use hyphens.
6. **No begging.** No "if you liked this, hit subscribe and the bell notification."
7. **The reinforce beat is ONE line.** If it's growing, it's becoming a recap - cut it back.

---

## Failure modes - self-check before presenting

- [ ] Reinforce beat is one line and frames a specific capability the viewer now has
- [ ] Curiosity gap is specific to the next video named (not vague)
- [ ] Next video is real - exists in `05_Assets/Transcripts/`, `04_YouTube/Archive/`, or named by the user
- [ ] Length is 15-25 seconds spoken
- [ ] Voice matches `core_voice-style.md`
- [ ] No begging for likes/subscribes
- [ ] No em dashes

If any check fails, rewrite before presenting.
