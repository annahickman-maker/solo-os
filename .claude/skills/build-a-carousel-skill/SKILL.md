---
name: build-a-carousel-skill
description: 'One-time setup that builds you your own Instagram carousel skill. It learns a brand design from a few visual references, generates a reusable template library, then saves a personal carousel skill that turns any script into on-brand 1080x1350 slides every time you run it. Use when the user wants to set up carousels for a brand, build their carousel design system, or create a repeatable carousel skill. Run once per brand: for the user own brand it saves an "Instagram Carousel" skill under Create; for a client brand it saves a "{Brand} Carousel" skill under Clients.'
title: Create a Carousel Skill
card: 'Set up a brand design once, get a reusable carousel skill back.'
category: Meta
outputs:
  - type: content
    description: a new personal carousel skill saved to the Skills page
icon: instagram
color: '#D672B0'
---

# Build a Carousel Skill

This is a one-time setup. You run it once for a brand, and it hands you back your own carousel skill - one that already knows your fonts, colours, and slide layouts. After that, making a carousel is just "here's my script, give me the slides."

## What you end up with

- A saved design system for the brand (`design-system.json` plus a template library).
- A new skill on your Skills page that does the actual carousels:
  - **Your own brand** -> "Instagram Carousel" under **Create**.
  - **A client's brand** -> "{Brand} Carousel" under **Clients**.

## Before you start

Read `REFERENCE.md` in this folder - it has the design-system schema, the template format, the slide-type taxonomy, the rotation algorithm, and the page-shell internals. If the brand has a `CLAUDE.md`, read it for voice rules.

## Step 1 - Whose brand is this?

Ask one question first: is this for your own brand, or a client's? It decides where the new skill lands.

| | Slug | Title | Category |
|---|---|---|---|
| Own brand | `instagram-carousel` | Instagram Carousel | Create |
| Client brand | `{brand-slug}-carousel` | {Brand} Carousel | Clients |

Then confirm the **brand vault path** - the folder that holds (or will hold) `Channel - Instagram/`. Everything the design and the carousels get saved into lives there.

## Step 2 - Learn the design

1. Ask for 3-8 visual references: uploaded images of carousels they love, or a link/path to an existing brand site or mockup.
2. Extract a design system as JSON using the schema in `REFERENCE.md` -> "design-system.json schema". Pull the palette, fonts (with real `@font-face`/Google sources), type scale, spacing, motifs, and tone words. Show it to the user and get edits.
3. Write it to `{brand-vault}/Channel - Instagram/brand-templates/design-system.json`.

## Step 3 - Build the template library

1. Ask which slide types to seed. Default is 6: hook, statement, list, quote, before-after, cta (see `REFERENCE.md` -> "Slide types").
2. Generate one HTML file per template at `brand-templates/templates/{type}-{variant}.html`, using the format in `assets/template-format.md`. Placeholders only, never real copy. Model them on `assets/example-templates/`.
3. Write `brand-templates/templates/README.md` - one line per template.
4. Initialise `brand-templates/_rotation-log.json` as `{}`.
5. Render a preview: assemble a sample carousel with placeholder copy using `assets/page-shell.html`, open it in a browser preview, and let the user approve the look before you save the skill. It opens as a click-through carousel they can page through.

## Step 4 - Save the carousel skill

1. Read `assets/generated-skill-template.md`.
2. Fill its `<<...>>` tokens for this brand (slug, title, card, description, category, brand name, brand vault). Leave every `{{...}}` token exactly as-is - those are page-shell placeholders the new skill fills at its own run time, not now.
3. Write the result to `~/.claude/skills/{slug}/SKILL.md`.
4. Tell the user it's done: name the skill, say which category it landed in, and tell them they can run it any time from the Skills page. From now on, carousels for this brand go through that skill - not this one.

## Hard rules

- 1080x1350 exactly. Non-negotiable.
- No em dashes anywhere. Hyphens only.
- Real web fonts via `@font-face` or Google Fonts CDN. Never canvas-rasterized.
- This skill is the one-time setup. The carousel-making lives in the skill it generates. Only re-run this when the brand's design itself needs to change.

## Advanced

See `REFERENCE.md` for the design-system schema, template format spec, slide-type taxonomy, rotation algorithm, page-shell internals, and troubleshooting.
