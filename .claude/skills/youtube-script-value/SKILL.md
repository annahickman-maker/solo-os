---
name: youtube-script-value
description: 'Write one value section of a YouTube script using the WHY/WHAT/HOW/PAYOFF+REHOOK structure. Each value section is one teaching point. Called once per value point in the video. The PAYOFF+REHOOK ending pulls the viewer into the next section. Use when the user is scripting a single value section, or repeatedly when called by /youtube-script orchestrator (once per teaching point).'
category: Create
hidden: true
---

# YouTube Script Value

Writes ONE value section in the body of the video. A typical video has 3-5 value sections - this skill is called once per section.

The job of a value section: over-deliver on the value promised in the intro. Never hold back. Make the viewer think "How am I getting this for free?" Then PAYOFF + REHOOK pulls them into the next section.

---

## Preflight

1. Read `01_Core/core_voice-style.md`, `01_Core/core_ip.md` (set up in Solo OS onboarding). If your core files aren't set up yet, stop and say: run /solopreneur-onboarding first.
2. Load your content focus avatar - the specific person this video is for. Read `content_focus_avatar` from `00_System/state.md` (a path to an avatar file) and read that avatar in `05_Assets/Avatars/`. If none is set, fall back to `core_audience.md`.
3. Check `05_Assets/POVs/` and `05_Assets/Stories/` for relevant material on this teaching point.
4. Read `06_Swipe/` to see if anything relevant is in there - if so, surface it to the user with attribution. Do not use swipe content directly.

---

## Required inputs

Confirm before drafting. If missing, ask.

- The teaching point this section covers (one clear thing)
- The position of this section in the video (1st value point, 2nd, 3rd, etc, and what comes next)
- Whether this point is part of a numbered framework or a standalone insight
- The video's overall transformation (so this section serves it)
- Any specific examples, stories, or proof from the user's own experience that fit this point

---

## The 4 beats of a value section

Each beat can be 1-3 sentences. Beats flow as one section, not as labelled boxes.

### 1. WHY
Why this matters. Build curiosity and emphasise the importance and pay-off of what they're about to learn.

Frameworks:
- "In order to [achieve X], you need to [do this thing]."
- "If you don't get this right, [consequence]."
- "This is the difference between [A] and [B]."

Example:
> "In order to get someone to actually watch your video, they need to believe that this method will work for them."

### 2. WHAT
What it is - the insight, tip, step, or principle.

Frameworks:
- "So this section is about [specific thing]."
- "The shift is [specific change in approach]."
- "The [step / principle / framework] is [name + one-line description]."

Example:
> "So this section is about shifting their mindset and overcoming any objections they have before they have a chance to lose interest and click off."

### 3. HOW
How to apply it. Examples, stories, steps. This is the tactical meat - don't hold back here.

Pull from `05_Assets/` for real examples. If the user has a story that fits, USE IT. If not, ask before inventing one (and never invent).

Frameworks:
- "Here's how this works in practice..."
- "The way I do this is..."
- "Common objection: [X] - show them why your method is different."
- "[Specific tactical sequence]"

### 4. PAYOFF + REHOOK
Two parts:
- **Payoff:** satisfy the point. Wrap the WHAT and HOW into a clear takeaway.
- **Rehook:** open a curiosity loop into the next section by making this section's result feel INCOMPLETE without the next one. The next section isn't "more" - it's what makes this section actually work.

The principle: each value section is one piece of a chain. The rehook makes the dependency explicit. The viewer should feel that without the next section, what they just learned will fail or fall short.

Strong rehook patterns:

**Pattern A - Useless without the next thing:**
- "So we've nailed [section's result]. But here's the problem: [section's result] is completely useless without [next section's result]. And that's exactly what I'm gonna show you next."

**Pattern B - Achieves a partial result, but the bigger desired outcome needs the next piece:**
- "Now you've got [partial result]. But [partial result] alone only gets you [smaller outcome]. The thing that actually [bigger desired outcome the audience wants] is [next section's topic] - which is where most people fall apart."

**Pattern C - Open the loop on why the next section matters:**
- "So this section gets you [result]. But the real reason any of this matters comes down to what's coming next. Because without [next section's value], you'll [specific consequence the audience fears]."

**Pattern D - The next section answers the inevitable next question:**
- "Once you've [this section's result], the very next question becomes: [the question]. And that's exactly what [next section] solves. So let's get into it."

Each of these makes the next section feel ESSENTIAL, not optional. Generic transitions like "stay tuned for more" fail. The rehook must be specific to the actual next section's value.

If this is the LAST value section before the CTA or outro, the rehook can flow into the CTA / outro instead of teasing another value section. Pattern: "And once you've got [last value point], you've got everything you need to [final transformation]. Which brings me to..."

---

## How to run the skill

Two modes:

### Mode A - Walk through (default)

If the user wants to build the section collaboratively:

1. Confirm required inputs
2. Walk through the 4 beats one at a time, in order
3. For each beat: name its job, offer 1-2 drafts pulled from assets and voice style, ask the user to pick or tweak, STOP and wait
4. Once all 4 are locked, present the final section per the output format below

### Mode B - One-shot draft

If the user provides full context up front:

1. Read all required files + assets relevant to this teaching point
2. Draft the section as flowing narrative, with the 4 beats embedded
3. Run the self-check before presenting
4. Present per the output format below

---

## Output format

```
[full value section as flowing narrative, the way it would be spoken]

---

**4-beat breakdown:**
- WHY: [the sentence(s) that do this job]
- WHAT: [the sentence(s) that do this job]
- HOW: [the sentence(s) that do this job - this is the longest beat]
- PAYOFF + REHOOK: [the payoff sentence + the rehook into the next section]

**Story used:** [name of story from assets, or "none" if no story used]
**Rehook leads into:** [what the next section/topic is]
```

---

## Hard rules

1. **Source rule - your POVs only.** Every value point must come from the user's own POVs, frameworks, and lived experience. Never pull concepts, terminology, or ideas from `06_Swipe/` or other people's content. Swipe files inform structure only - never substance.
2. **Voice overrides framework.** Match `core_voice-style.md`.
3. **Never invent examples, proof, or stories.** Pull from `05_Assets/`. If nothing fits, ask the user.
4. **Don't hold back on HOW.** YouTube is not the place for surface-level tips. Over-deliver. Make people think "How am I getting this for free?"
5. **Never use em dashes.** Use hyphens.
6. **PAYOFF + REHOOK is one beat with two parts** - don't skip the rehook, it's what holds retention.
7. **Total length:** 90-180 seconds per value section, depending on the depth of the point.

---

## Failure modes - self-check before presenting

- [ ] WHY beat builds genuine curiosity, not just "this is important"
- [ ] WHAT beat names the insight clearly - one sentence test: could the viewer paraphrase what this section is about?
- [ ] HOW beat has tactical specifics - examples, sequence, real things to do (not abstract principles)
- [ ] PAYOFF wraps the value
- [ ] REHOOK opens a specific curiosity gap into the named next section (not generic "stay tuned")
- [ ] No swipe-file ideas, terminology, or borrowed concepts presented as the user's own
- [ ] Voice matches `core_voice-style.md`
- [ ] No invented stories, examples, or proof
- [ ] No em dashes

If any check fails, rewrite before presenting.
