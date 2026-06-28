<!--
  GENERATED-SKILL TEMPLATE
  The Build a Carousel Skill factory fills the <<...>> tokens and writes the
  result to ~/.claude/skills/<<SKILL_SLUG>>/SKILL.md. Leave every {{...}} token
  intact - those are page-shell placeholders the generated skill fills at its
  OWN run time, not here.

  Tokens to fill:
    <<SKILL_SLUG>>        e.g. instagram-carousel  (own brand)  |  acme-carousel (client)
    <<SKILL_TITLE>>       e.g. Instagram Carousel              |  Acme Carousel
    <<SKILL_CARD>>        one-line card for the Skills page
    <<SKILL_DESCRIPTION>> the when-to-use trigger (one line)
    <<SKILL_CATEGORY>>    Create (own brand)  |  Clients (client brand)
    <<BRAND_NAME>>        e.g. Your Brand  |  Acme Skincare
    <<BRAND_VAULT>>       absolute path to the brand vault (holds Channel - Instagram/)
-->
---
name: <<SKILL_SLUG>>
description: '<<SKILL_DESCRIPTION>>'
title: <<SKILL_TITLE>>
card: <<SKILL_CARD>>
category: <<SKILL_CATEGORY>>
icon: instagram
inputs:
  - type: carousel-source
    optional: true
outputs:
  - type: content
    description: carousel slides rendered as 1080x1350 PNGs you download from the page
knowledge: <<BRAND_VAULT>>/Channel - Instagram/brand-templates/
---

# <<SKILL_TITLE>>

Your design is already set. This turns a carousel script into on-brand slides - it never re-asks for your fonts, colours, or layouts.

- Brand: <<BRAND_NAME>>
- Brand vault: <<BRAND_VAULT>>
- Design system: <<BRAND_VAULT>>/Channel - Instagram/brand-templates/design-system.json
- Templates: <<BRAND_VAULT>>/Channel - Instagram/brand-templates/templates/

## Run it

1. Get the source. The run panel lets the user pick what to turn into a carousel: an Instagram post or draft (including already-posted content - high performers are starred as suggestions) or a story from their bank. They can also paste a script or describe a fresh idea. Whatever comes in, shape it into carousel slides - one block per slide. If they picked a posted reel or a story, adapt that content into a carousel arc (hook -> points -> cta); don't just dump the caption.
2. Read `design-system.json` and every `templates/*.html` in the brand-templates folder above.
3. Identify the slide type per slide (hook / statement / list / quote / image / cta).
4. Pick a template per slide using rotation. See the factory reference at `~/.claude/skills/build-a-carousel-skill/REFERENCE.md` -> "Rotation algorithm". Update `_rotation-log.json`.
5. Build `slides.html`:
   - Read the shell at `~/.claude/skills/build-a-carousel-skill/assets/page-shell.html`.
   - For each slide, read the picked template, substitute its slot placeholders with the script content, and wrap as `<article class="slide" id="slide-N">...</article>`.
   - Replace `{{SLIDES}}`, `{{BRAND_FONTS_CSS}}`, `{{BRAND_TOKENS_CSS}}`, `{{BRAND_NAME}}`, `{{TITLE}}`, and `{{ZIP_FILENAME}}` in the shell. The fonts/tokens come from `design-system.json` (see the factory reference -> "page-shell.html internals").
6. Save to `<<BRAND_VAULT>>/Channel - Instagram/carousels/{YYYY-MM-DD}-{slug}/slides.html` and copy the source script alongside as `source-script.md`.
7. Show it for approval in the chat. Say one short line ("here's your carousel - flip through it and approve if it's good"), then emit a fenced `carousel` block whose only line is the carousel path **relative to the dashboard vault root** (i.e. starts with `Channel - Instagram/carousels/`). The dashboard renders it inline as a click-through preview with an "Approve -> Ready to Schedule" button:

   ```carousel
   Channel - Instagram/carousels/{YYYY-MM-DD}-{slug}/slides.html
   ```

   On approve it lands in the Instagram "Ready to Schedule" lane as a carousel card (badged carousel, with the click-through preview + caption generator). This in-chat preview works when the carousel lives under the dashboard's own vault (the user's own brand). For a client brand whose vault is separate, open `slides.html` in a browser preview instead.
8. Offer tweaks. Iterate by editing `slides.html` directly - the preview re-reads it.

## Hard rules

- 1080x1350 exactly. Non-negotiable.
- No em dashes anywhere. Hyphens only.
- Real web fonts via `@font-face` or Google Fonts CDN. Never canvas-rasterized.
- Do NOT regenerate the templates here - that is the setup skill's job. If the design itself needs to change, re-run Build a Carousel Skill.
