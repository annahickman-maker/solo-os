---
name: youtube-onboarding
description: One-time channel positioning setup for the YouTube skill pack. Asks 7 channel-positioning questions and produces 04_YouTube/core_channel-positioning.md, which every other YouTube skill reads from. Assumes Solopreneur OS onboarding is already complete and reads the user's SS core files as input. Use whenever the YouTube skill pack is first installed, when a YouTube skill detects that channel positioning is missing, or when the user asks to "onboard YouTube" or "set up the YouTube channel".
---

# YouTube Onboarding

Sets up the user's YouTube channel positioning. This is the gate for every other YouTube skill - none of them work until this is complete.

This is a coaching conversation. One question at a time. Listen, push for specificity, never invent answers.

---

## Preflight check

Before running any phase of this skill, do this in order:

1. Check that all 6 SS core files exist:
   - `01_Core/core_positioning.md`
   - `01_Core/core_audience.md`
   - `01_Core/core_my-story.md`
   - `01_Core/core_ip.md`
   - `01_Core/core_offer-suite.md`
   - `01_Core/core_voice-style.md`

2. If any are missing, STOP. Tell the user:
   > "YouTube onboarding sits on top of Solopreneur OS - so we need your foundation first. Run /solopreneur-onboarding and come back to this when it's done."
   
   Do not proceed.

3. If all 6 exist, read them. Use them as context for every question - the user shouldn't have to repeat foundational answers.

4. Check whether `04_YouTube/core_channel-positioning.md` already exists. If yes, ask: "I see you already have channel positioning saved. Do you want to start fresh, or update what's there?" Branch accordingly.

5. Migration check - look for legacy YouTube OS files. If any of these exist, the user is migrating from old YTOS and we should pre-populate fields rather than asking again:
   - `01_Core/core_cta.md` - legacy CTA file from old YTOS. If it exists AND has been filled in by the user (not just placeholder text in square brackets), read it. When you reach Question 7 (Main channel CTA), pre-populate the CTA text and link from this file. Show the pre-filled answer to the user and ask them to confirm or update, rather than asking from scratch.
   - **Detecting an empty template:** if `core_cta.md` contains placeholder strings like `[What you want viewers to do...]`, `[The short line that appears...]`, or `[The URL]` in the relevant fields, treat it as empty and fall through to asking the question normally. Only pre-populate from a CTA file the user actually filled in.

---

## Welcome message

> "Welcome to the YouTube skill pack.
>
> Your Solopreneur OS foundation gives us your business positioning, audience, story, core IP, offer suite, and voice. This onboarding takes that foundation and turns it into your YouTube channel positioning - the specific cut of who your channel is for and what it does.
>
> Until this is filled in, none of the other YouTube skills will run. After this, you can use /youtube-script, /youtube-title, /youtube-description, and the rest.
>
> 7 questions. About 15-20 minutes. Ready?"

Wait for confirmation before continuing.

---

## The 7 questions

Ask one at a time. After each answer:
- Push for specificity if vague
- Reflect back what you heard before moving on
- Reference SS core files where relevant ("I see in your audience profile that you're talking to X - is the channel for that same person, or a narrower cut?")

### 1. The transformation
> "What is the transformation your channel exists to create? What is the shift that happens for someone who follows your channel?"

Push if it's a topic ("I teach web design") rather than a transformation ("designers go from selling time to selling outcomes").

### 2. The specific person
> "Picture one specific person this channel is for. Not a demographic - a real person you can see. Who comes to mind?"

If they name someone vague ("solopreneurs"), push:
> "Go more specific. One person. What are they doing right now? What's running through their head?"

Cross-reference `core_audience.md` - if the SS audience and the channel audience are different, capture the channel-specific cut.

### 3. From A to B - the core desire
> "When someone is bingeing the videos on your channel, what are they ultimately hoping these videos will help them do? Not the surface goal - the core result behind it.
>
> For example: not 'build their website' but why do they want to build the website? What does that website give them? What's the core desire?"

Push past the visible task to the underlying motivation. "Build a website" isn't the desire - the desire is what the website unlocks (clients, freedom, credibility, time back). Keep digging until you have the core desire behind the surface goal.

### 4. Where you're taking them
> "What's the destination? Past the immediate transformation - what does their life or business look like once your channel has done its job?"

This is the long-arc outcome. Bigger than one A→B. The view from the top of the mountain.

### 5. Value you share
> "What specific value do you share on this channel to take people through this transformation? What do you teach? What insights, frameworks, behind-the-scenes, or proof do you offer?"

Reference `core_ip.md` if available - the channel value is often the channel-friendly cut of their core IP.

Push: "Insight over information. Information is steps anyone could Google. Insight is your take on why something works, what most people get wrong, what actually made the difference based on your experience."

### 6. Value you don't share
> "What types of content do you deliberately NOT make on this channel?
>
> This isn't about gatekeeping or what you're reserving for paid offers. It's about differentiation - how you set yourself apart from others in your niche, and how you filter for the right audience by being specific about what you don't make.
>
> What types of content would attract the wrong person? What do you have no interest in making? What would dilute who this channel is for?"

Push for at least 3 specifics. Frame it as audience filtering, not as gatekeeping.

Examples (depending on the user's positioning):
- "If you're attracting a high-ticket audience, you're probably not making beginner tutorial videos."
- "Day-in-the-life videos that don't interest you."
- "Trend-chasing content that doesn't fit your channel's promise."
- "Listicle videos when your channel is built around depth."

This is about what the user does NOT want to align themselves with - the content types that would pull in the wrong audience or dilute the channel's identity.

### 7. Main channel CTA
Every single video on the channel funnels toward ONE CTA. Consistent. Not a different CTA per video - the same one across the whole channel.

The CTA destination depends on what the user is selling:
- **Low-ticket offer:** the CTA can funnel directly to that product (the buying decision is small enough to make from a video)
- **High-ticket offer:** the CTA usually funnels to an email list, free community, or lead magnet first - then they get nurtured before the offer

**If `01_Core/core_cta.md` exists AND is filled in (migrating YouTube OS user with real data):**

Read it and pre-populate the CTA text and link from that file. Skip placeholder values - if a field still contains text like `[What you want viewers to do after watching]`, treat the file as empty and fall through to the standard question.

If real values are present:

> "I see you already have a CTA saved from your previous YouTube OS setup:
>
> **Text:** [pre-populated from core_cta.md]
> **Link:** [pre-populated from core_cta.md]
>
> Want to keep it, or has your CTA changed since you last set this up?"

If they keep it, capture as the answer. If they update it, ask the standard question below.

**Otherwise (new user OR migrating user with empty template), ask:**

> "What's the one CTA every video on your channel funnels toward?
>
> Every video should be pointing to the same place. If your offer is low-ticket, this might be the product itself. If your offer is high-ticket, this is more likely a free community, email list, or lead magnet - somewhere people land before they're ready to buy.
>
> What's yours?"

Reference `core_offer-suite.md` if available - the user's primary CTA is documented there. Confirm whether the channel CTA matches the primary CTA, or whether (for high-ticket) it's a top-of-funnel version that nurtures into the primary offer.

**Capture two things:**

1. **CTA text** - 4 to 6 words. Must name the RESULT or what the product/freebie helps them do, not the action of clicking. Push the user past generic action language ("join the community") toward result language ("build your first offer", "land your first client", "grow your channel").
   - Weak (action only): "Join the free community", "Download the template", "Book a call"
   - Strong (result-focused): "Build your offer faster", "Land your first client", "Grow your YouTube channel", "Sell your knowledge"
   
   If the user gives action-language, push: "What's the result they get from doing that? Frame the CTA around the outcome, not the click."

2. **Link** - the exact URL the CTA points to.

---

## Save

Save to `04_YouTube/core_channel-positioning.md` with this structure:

```markdown
---
type: core
slug: channel-positioning
status: active
tags:
  - type/core
  - domain/youtube
aliases:
  - YouTube Channel Positioning
---

# YouTube Channel Positioning

## Transformation
[answer]

## Specific person
[answer]

## A to B
**From:** [A state]
**To:** [B state]

## Where you're taking them
[answer]

## Value you share
[answer - bulleted list]

## Value you don't share
[answer - bulleted list]

## Main channel CTA
**Text:** [the spoken/written line]
**Link:** [the URL]
```

---

## Confirm and close

After saving, confirm:

> "Your YouTube channel positioning is saved to `04_YouTube/core_channel-positioning.md`.
>
> Every YouTube skill reads this file before doing anything. It's the anchor for your scripts, titles, thumbnails, descriptions, and ideas - so they all stay aligned to the same channel.
>
> You can now run any YouTube skill:
> - /youtube-ideas - develop video ideas
> - /youtube-title - generate titles
> - /youtube-thumbnail - design a thumbnail
> - /youtube-script - take a video from idea to finished script
> - /youtube-script-intro, /youtube-script-context, /youtube-script-value, /youtube-script-cta, /youtube-script-outro - work on individual sections
> - /youtube-description - write a description from a transcript
> - /youtube-analytics - review a video's performance
> - /youtube-transformation-series - plan your first 5 videos
>
> Just tell me which one you want to run."

---

## Rules

- One question at a time. Never stack.
- Read SS core files at the start. Reference them in questions. Don't make the user repeat foundational answers.
- If an answer is vague, push for specificity before moving on.
- Never invent transformations, audience traits, value statements, or CTAs.
- Format output for readability - line breaks between thoughts, bullets for lists, never a wall of text.
- Never use - (em dash). Use - instead.
- Respect every STOP condition.
