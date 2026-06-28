---
name: sales-page-builder
description: 'Orchestrator that walks through building any sales page from start to finish - identify page type, gather context, generate an outline first, get user approval, then write the full copy. Use when the user asks to write or generate a sales page, landing page, opt-in page, VSL page, funnel page, or any standalone page selling a specific offer. Picks the correct page type (long-form / short-form / opt-in / VSL / funnel) before writing a word, and composes headline-writing, cta-writing, testimonial-selection, storytelling-for-conversion, and emotion-in-copy.'
title: Write a Sales Page
card: Write your landing page copy from an offer and audience.
category: Create
inputs:
  - type: offer
  - type: avatar
outputs:
  - type: project
    description: 'the finished sales page - saved to the project AND pasted in full into the chat'
---

# Sales Page Builder

Walk a user from "I have an offer" to "I have a finished sales page in my voice." Generates an outline first, gets approval, then writes the full page. Anti-AI, anti-hype, non-pushy.

## Required vault data

- `01_Core/core_voice-style.md`
- `01_Core/core_offer-suite.md`
- `01_Core/core_audience.md`
- `01_Core/core_my-story.md`
- Proof (optional, stronger output if present): `00_System/proof-points.json` and `05_Assets/Proof/`

If any required file is missing, stop and name it. The CTA is written by the `cta-writing` skill from the chosen offer - there is no separate core CTA file to read.

When this skill is run from the dashboard, the specific offer and audience avatar arrive as inputs (the offer points at `core_offer-suite.md`, the avatar points at its own profile file). Read those first - they are the focus for this page.

## Skills used (in order)

1. `storytelling-for-conversion` - story arc and 4-part reader-facing pattern
2. `testimonial-selection` - proof-to-objection mapping
3. `headline-writing` - page headline + section headlines
4. `cta-writing` - CTA copy and placement
5. `emotion-in-copy` - applied throughout, governs where emotion goes
6. `brand-voice-writing` (auto-loads) - voice consistency
7. `website-sections-cheatsheet` (auto-loads) - general section patterns
8. `seo-aio-optimisation` (auto-loads) - final pass

See [REFERENCE.md](REFERENCE.md) for: page type selection, traffic source consideration, above-the-fold rules, full page structure, page-type formulas, anti-AI strip-list with alternatives, output format.

## Workflow (outline-first)

### Phase 1 - Gather + Decide

1. **Identify the page type** (see REFERENCE.md Framework 1):
   - **Long-form sales** - mid to high-ticket, complex offers, full narrative
   - **Short-form sales** - low-ticket, simple decisions, digital products
   - **Opt-in / Squeeze** - free lead magnet, max 2 form fields
   - **VSL** - video-led, hook question + price anchor + CTA after key milestone
   - **Funnel page** - one stage in a multi-page sequence
2. **Identify the traffic source.** Affects how nurtured the visitor needs to be:
   - Long YouTube content -> less nurturing needed
   - Short-form social (TikTok/IG) -> more nurturing
   - Paid ad / cold click -> maximum nurturing
   - Existing email list -> context-aware, less nurturing
3. Read the chosen offer in `core_offer-suite.md`. Identify the offer transformation (clear before/after).
4. Pick storytelling arc - call `storytelling-for-conversion`
5. Map proof to objections - call `testimonial-selection`

### Phase 2 - Generate the OUTLINE (do NOT write full copy yet)

6. Generate a complete section-by-section outline of the chosen page type. For each section include:
   - Section name
   - One-line summary of what this section will say
   - Key points / proof / data to include
   - Suggested headline for the section
   - CTA placement (yes/no, what kind)
7. **Above-the-fold check.** The hero (headline + sub + CTA) must immediately answer all four:
   - What you do
   - Who it's for
   - How it makes their life better
   - What you want them to do next
   If the outline doesn't cover all four above the fold, fix the outline before continuing.
8. **STOP.** Present the outline to the user. Wait for approval or refinement. **No full copy is written until the outline is approved.**

### Phase 3 - Generate the full copy

9. Write the page headline (call `headline-writing`)
10. Walk through the approved outline section-by-section:
    - Compose the relevant methodology skills + auto-loaded skills
    - Apply `emotion-in-copy` based on section type (recognition in mirror, relief in reframe, hope in vision, none in logistics)
11. Write the CTAs at approved placements (call `cta-writing`)
12. SEO/AIO pass (call `seo-aio-optimisation`)

### Phase 4 - Voice check + ship

13. Run the anti-AI voice check (see strip list below). Strip everything on the list. See REFERENCE.md for "do this instead" alternatives.
14. Save the finished page. The SAVED FILE is the page copy ONLY - it starts at the headline and ends at the sign-off. Do NOT write a status line, a page-type/traffic/goal config block, design inspo, designer notes, a "Notes" section, a document title, or a "Copy" wrapper into the file (see REFERENCE.md Section 12). Put the page type and any design direction in your chat reply instead, not in the file. If a save path was given in the run inputs (when run from an offer, the page belongs to that offer at `07_Products/sales-pages/<offer-slug>.md`), write there; otherwise default to `07_Products/sales-pages/<offer-slug>.md`. EITHER WAY, paste the full page into the chat so the user can read and copy it right there. Never just say where it was saved - always show the whole page.
15. Present for refinement.

## Anti-AI voice check (run before output)

**Strip:** fake urgency / countdown timers / "spots almost gone" / value stacks / guarantee theater / hype words (game-changer, crushing it, transform, unlock, supercharge, 10x) / generic CTAs (Get Instant Access, Claim Your Spot, Order Now, Submit) / bonus pyramids / empty social proof ("as seen in" obscure logos) / praise-stacking testimonials with no specifics / P.S. urgency reinforcement / em dashes (use hyphens, global vault rule).

**Keep:** specific numbers as proof / real urgency only (real cohort dates, real price changes) / pre-dismissal of audience / conversational fragments / self-deprecating honesty / direct address / one personal sign-off / Tier 2 emotional/transformation testimonials when Tier 1 number-led ones aren't available.

See REFERENCE.md for the full strip list with "do this instead" alternatives for every item.
