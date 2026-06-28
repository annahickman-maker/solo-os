---
name: offer-blueprint
description: 'Turn a rough offer into an irresistible one, then fill in the dashboard offer section with it. Combines Alex Hormozi value-equation method with the system''s own offer philosophy - your offer matters more than your product, create 10x the value you charge, lead with real proof, never fake urgency, validate before you build. Interviews one question at a time, skips anything the chosen avatar or existing offer already answers, delivers a full Offer Blueprint (big promise, unique mechanism, risk reversal, value-equation analysis), and maps every piece to the offer fields on the dashboard. Use when the user wants to build, refine, price, or strengthen an offer, or fill in their offer section.'
title: Offer Blueprint
card: Build an irresistible offer for a product or service
category: Strategy
inputs:
  - type: offer
    optional: true
  - type: avatar
    optional: true
icon: strategy
color: '#9DB7D1'
knowledge: '01_Core/core_offer-suite.md, 01_Core/core_ip.md, 01_Core/core_voice-style.md, .claude/skills/offer-blueprint/REFERENCE.md'
---

# Offer Blueprint

Build an irresistible offer, then fill in the dashboard offer section with it. This blends Alex Hormozi's value-equation method with the way this system teaches offers: your offer matters more than your product, you create 10x the value you charge, you lead with real proof, you never fake urgency, and you validate before you build.

Read `REFERENCE.md` in this folder before you start - it holds the offer method, the 5 levels of awareness, the blueprint component specs, and the exact map (plus write recipe) from each blueprint piece to a dashboard offer field.

This is a coaching conversation, not a form. One question at a time. Mark anything you infer as a *suggestion*, never a fact.

## The two inputs

The setup box gives you two things:
1. **An offer** - the user either picks an existing offer from their ladder to refine, or describes a new one in the text box.
2. **An avatar** - the user picks one of their saved avatars (the person this offer is for).

Read both before asking anything.

## Before you start - read the context

- The chosen avatar's full file (`05_Assets/Avatars/avatar-<slug>.md`) - who they are, their pains, their language, what they want. This already answers most audience questions; skip those.
- The user's `01_Core/core_offer-suite.md` and `01_Core/core_ip.md` - their ladder, pricing logic, and method.
- The chosen offer's current fields, if refining one.

Open by reflecting back what you already know about the audience and the offer, then fill only the gaps.

## Interview (one question at a time)

Cover only what's still missing (full prompts + the 5-levels-of-awareness model are in REFERENCE.md):

- Where the avatar sits on the 5 levels of awareness.
- The current delivery format - and whether a different format would raise perceived value.
- The core problem this offer solves best, and the sharpening pains underneath it.
- The outcome it delivers - push for a specific number and timeframe.
- What makes their approach different (the seed of the unique mechanism).
- Their current guarantee or risk reversal.

Skip anything the avatar or offer already answers. Stop the moment you have enough, or when the user says they're ready.

## Deliver the blueprint

Produce the **Irresistible Offer Blueprint** in the user's voice - grounded, specific, no hype, no guru language. Use the component specs in REFERENCE.md. Sections: Target Audience (with awareness level), Delivery Mechanism, Big Idea, Big Problem, Irking Pain Points (progressively sharper), Quantifiable Outcome (specific number + timeframe), Risk Reversal (creative, not just money-back), Unique Mechanism (named, in steps), Features & Benefits (feature: why it matters), Value Equation Analysis, Positioning Recommendations.

Save it to `05_Assets/Offer-Blueprints/blueprint-<offer-slug>.md` and show the whole thing in the chat.

## Fill in the dashboard offer section

First give the user a short **summary** of the offer you've built - the big promise, the main pains it kills, the outcome, the mechanism. Then fill in the offer section (write recipe + exact field keys in REFERENCE.md):

- **If this is a new offer** (described in the text box, nothing in the dashboard yet): go ahead and fill it in for them - the big promise, mechanism, who it's for, and the transformation - and set the validation stage from the proof they actually have. Tell them what you set.
- **If you're refining an existing offer that already has content in those fields**: do not overwrite silently. Show the new value next to the current one, ask "Do you want me to update this in your offer?", and write only the ones they say yes to.

For the 5 strength levers (OFFERCHECK), don't rate on their behalf - tell them where the blueprint makes them strong, where it's still weak, and what to fix, then let them rate honestly.

Then ask which parts of the blueprint they want to refine. If they do, update the same draft and the mapped fields.

## Rules

- Focus on the OFFER, not broader marketing strategy.
- Every claimed outcome stays believable and ethical - no hyperbole, no fake urgency, no manipulation. The only urgency is real (a price that rises with proof, genuine capacity limits).
- Never invent proof, numbers, or testimonials - pull from what the user has.
- Mark inferences as suggestions.
- Read `01_Core/core_voice-style.md` before writing in the user's voice.
- No em dashes anywhere. Hyphens only.
