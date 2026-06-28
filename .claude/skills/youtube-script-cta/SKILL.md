---
name: youtube-script-cta
description: 'Write a mid-video implementation-helper CTA - the soft, casual mention of an offer or freebie that gets dropped into a video after a value section. Uses the Barrier / Shortcut / Alignment / Casual Invite structure. Pulls the YouTube CTA the user set on their Content page. This is NOT the outro CTA - this is the in-flow mention. Use when the user is scripting a mid-video CTA, or when called by /youtube-script orchestrator at the right point in the script.'
category: Create
hidden: true
---

# YouTube Script CTA

Writes the mid-video implementation-helper CTA. This is the casual mention dropped into the video after a value section - "if you want this thing I just taught you in template form, link's down below."

This is NOT the outro CTA. The outro CTA is more strategic and lives in /youtube-script-outro.

This CTA can be dropped 1-2 times in a video. Common placements:
- Right after the user has just taught a framework, process, or system
- Before a demo of a tool, template, or resource
- After a heavy teaching section where implementation is genuinely hard

---

## Preflight

1. Read `01_Core/core_voice-style.md` (set up in Solo OS onboarding). If your core files aren't set up yet, stop and say: run /solopreneur-onboarding first.
2. Read your YouTube CTA - `youtube_cta_text` + `youtube_cta_url` in `00_System/state.md` (the "what you point viewers to" box on your Content page) - for the CTA text and link. Read `01_Core/core_offer-suite.md` if the CTA points to a specific offer that needs more context.

---

## Required inputs

Confirm before drafting. If missing, ask.

- What teaching just happened in the video right before the CTA (so the alignment is specific)
- Whether this CTA is your YouTube CTA default (from `00_System/state.md`) or a different one specific to this video
- Where in the video this CTA lands (after which value section)

---

## The 4 beats of a mid-video CTA

Each beat can be 1-2 sentences. The whole CTA reads in 15-25 seconds spoken.

### 1. BARRIER
Call out what makes implementation hard for the viewer. Acknowledge the gap.

Frameworks:
- "I've given you a lot of information in this video, and it can be very overwhelming to actually do all of this starting from a blank page."
- "Knowing this is one thing - actually doing it consistently is another."
- "You can take everything I've just walked through and try to build it from scratch, but [specific friction]."

### 2. SHORTCUT
Position your offer as the tool or shortcut that removes the barrier.

Frameworks:
- "And so I've put together a [template / system / playbook / community] that [specific benefit]."
- "If you want a faster way to do this, I've made [the offer]."
- "The good news is, you don't have to start from scratch - I've got [the offer]."

### 3. ALIGNMENT
Connect the offer directly to what was just taught.

Frameworks:
- "...that follows this exact framework"
- "...with everything I just walked through, ready to plug in"
- "...so you skip the part you're most likely to mess up"

### 4. CASUAL INVITE
Tell them where to get it. Soft, not salesy.

Frameworks:
- "...that you can grab for free down below"
- "Link in the description if you want it"
- "It's pinned in the comments / linked below"

---

## How to run the skill

One-shot only. The CTA is short enough (15-25 seconds spoken) that walking through it beat-by-beat is overkill. Just generate it.

1. Confirm required inputs are present (don't draft if anything is missing - ask)
2. Read all required files
3. Draft the CTA as one flowing block (4 beats embedded, no labels in the script)
4. Run the self-check
5. Present per the output format below

The user can edit or ask for variations after seeing the draft.

---

## Output format

```
[full CTA as flowing narrative - spoken, casual, 15-25 seconds]

---

**4-beat breakdown:**
- Barrier: [the sentence(s) that do this job]
- Shortcut: [the sentence(s) that do this job]
- Alignment: [the sentence(s) that do this job]
- Casual invite: [the sentence(s) that do this job]

**CTA used:** [the offer name]
**Link:** [the URL]
```

---

## Hard rules

1. **Voice overrides framework.** Match `core_voice-style.md`. The CTA must sound conversational - not like a sponsored ad read.
2. **Never invent the offer.** Use the YouTube CTA from `00_System/state.md` (`youtube_cta_text` + `youtube_cta_url`) or a specific offer from `core_offer-suite.md`. Confirm with user if unsure.
3. **Stay casual.** No "amazing", "exclusive", "limited time", "act now" language.
4. **Total length:** 15-25 seconds spoken. Any longer and it feels like a sales push.
5. **Never use em dashes.** Use hyphens.
6. **The alignment beat must be specific.** "...that follows this framework" only works if the user just taught a framework. If they didn't, rewrite the alignment.
7. **No "if you found this video helpful, give it a like" type asks.** That's not a CTA, it's begging. Stay focused on the offer + alignment.

---

## Failure modes - self-check before presenting

- [ ] Barrier names specific friction the viewer is feeling RIGHT NOW (not generic "this is hard")
- [ ] Shortcut directly addresses the barrier
- [ ] Alignment connects the offer to the actual teaching that just happened
- [ ] Casual invite is short and natural - not a sales close
- [ ] Voice is conversational, not promotional
- [ ] No hype language
- [ ] Length is 15-25 seconds spoken
- [ ] Uses the actual offer + link from `00_System/state.md` (`youtube_cta_text` + `youtube_cta_url`) (or a confirmed alternative)
- [ ] No em dashes

If any check fails, rewrite before presenting.
