# Build a Carousel Skill - Reference

Detailed spec for the `build-a-carousel-skill` factory and the carousel skills it generates. Read alongside `SKILL.md`.

---

## design-system.json schema

A single file at `{brand-vault}/Channel - Instagram/brand-templates/design-system.json`. Captures everything needed to render a slide on-brand without seeing the references again.

```json
{
  "brand": "Your Brand",
  "vault": "/path/to/your-brand-vault",
  "captured": "2026-04-29",
  "references": ["screenshot-1.png", "coaching-page-mockup-v2.html"],

  "palette": {
    "paper": "#FFFFFF",
    "cream": "#F5EFE3",
    "warm":  "#F9F4EA",
    "coal":  "#1A1A1A",
    "muted": "#7a7367",
    "accent": "#A85732",
    "accent-secondary": "#5C4A25"
  },

  "fonts": {
    "display": {
      "family": "IIVorkursMedium",
      "fallback": "Georgia, serif",
      "source": "@font-face from https://yourbrand.com/fonts/DisplayFont.woff2",
      "weights": [400]
    },
    "body": {
      "family": "Host Grotesk",
      "fallback": "system-ui, sans-serif",
      "source": "google",
      "weights": [400, 500, 600]
    },
    "mono": {
      "family": "DM Mono",
      "fallback": "ui-monospace, monospace",
      "source": "google",
      "weights": [400, 500]
    }
  },

  "type-scale": {
    "display-xl": "96px",
    "display-lg": "72px",
    "display-md": "56px",
    "body":       "22px",
    "small":      "16px",
    "mono":       "14px"
  },

  "spacing": {
    "frame-inset":   "56px",
    "edge-padding":  "80px",
    "body-padding": "120px",
    "stack-gap":     "32px"
  },

  "motifs": {
    "frame":      true,
    "eyebrow":    "mono uppercase, 0.22em tracking, with rust dot",
    "label-pill": "mono uppercase inside rust hairline pill",
    "hairline":   "1px rgba(26,26,26,0.18)",
    "footer":     "page-number bottom-right + small phrase bottom-left"
  },

  "tone-words": ["editorial", "clinical", "warm", "calm", "confident"],
  "anti-tone":  ["hype", "guru", "salesy", "neon", "playful"]
}
```

Required: `brand`, `palette` (at minimum paper/coal/accent), `fonts.body`, `fonts.display`. Everything else is optional but strongly preferred.

---

## Template format

Each template is a self-contained HTML fragment at `brand-templates/templates/{type}-{variant}.html`. It contains:

1. A YAML-style meta comment header
2. A `<style>` block scoped via specific class names
3. The slide markup as a single `<article class="slide [type-class]">…</article>`

Example header:
```html
<!-- @template
type: hook
variant: 1
description: Bold display headline with rust italic accent on cream background
slots:
  - eyebrow (string, optional)
  - headline (string with optional <em> tags for italic accent)
  - footer-left (string, default "swipe")
  - footer-right (auto-set to "NN / NN")
@end -->
```

Slot syntax in markup uses double curlies: `{{HEADLINE}}`, `{{EYEBROW}}`, `{{FOOTER_LEFT}}`. The renderer does plain string substitution. HTML in slot values is allowed (so `<em>` accents work).

The slide root must be `<article class="slide" id="slide-N">` where N is filled by the renderer at assembly time.

See `assets/example-templates/` for two complete templates.

---

## Slide types

Default 6 types Phase 1 generates. You can add brand-specific types when needed.

| Type | Purpose | Slots |
|---|---|---|
| `hook` | Opening slide. Big display headline, often with italic accent. | eyebrow, headline |
| `statement` | One bold idea, label pill above. | label, body |
| `list` | Numbered or bulleted points (3-5 items). | title, items[] |
| `quote` | Pull quote, attribution. | quote, attribution |
| `before-after` | Two photos side-by-side (or stacked) with labels and timeline. Common for clinical/transformation content. | image-before, image-after, label-before, label-after, caption (optional), timeline (optional) |
| `cta` | Final slide. Action + handle. | headline, cta-text, signature |

For each type, generate at least one variant. Generate two if the brand has range (e.g. light + dark hook variants).

---

## Rotation algorithm

Goal: consecutive carousels for the same brand should not look identical. Track which templates were used most recently per slide-type.

`brand-templates/_rotation-log.json` shape:
```json
{
  "hook":      ["hook-1.html", "hook-2.html"],
  "statement": ["statement-1.html"],
  "list":     ["list-1.html"]
}
```
Each list is the order the template was used, oldest first, max 10 entries. To pick a template:

1. Get all available templates for that slide-type (e.g. all `hook-*.html`).
2. Subtract the last entry in the log for that type. (Avoid back-to-back repeat.)
3. From the remaining set, pick the one used least recently (i.e. lowest count in the log, or never used).
4. If the script uses the same slide-type multiple times in one carousel, pick a different variant per instance when possible.
5. Append the picked template filename to the log.

If only one variant exists for a type, use it - no rotation possible.

---

## page-shell.html internals

Located at `~/.claude/skills/build-a-carousel-skill/assets/page-shell.html`. The wrapper with all the JS for the click-through carousel, the all-slides toggle, and PNG/ZIP download. Token replacements at assembly:

- `{{BRAND_NAME}}` - from design-system.json
- `{{BRAND_FONTS_CSS}}` - generated `@font-face` + Google Fonts `@import` from `design-system.json.fonts`
- `{{BRAND_TOKENS_CSS}}` - generated `:root { --paper: …; --coal: …; }` from `design-system.json.palette` and `type-scale` and `spacing`
- `{{SLIDES}}` - all assembled `<article class="slide">` elements concatenated
- `{{TITLE}}` - "Carousel - {script title} - {brand}"

The shell uses:
- `html2canvas` (CDN) for slide → PNG export
- `jszip` (CDN) for "Download all as ZIP"
- Vanilla JS for the carousel: opens in single-slide click-through mode (edge arrows, dot indicators, counter, keyboard arrows, touch swipe) with an "All Slides" toggle for a vertical review. Slides are 1080×1350 native and scaled-to-fit on screen.

---

## Conventions

- **Output filenames:** `slide-NN.png` zero-padded. ZIP filename: `{brand-slug}-{date}-{slug}.zip`.
- **Carousel folder slug:** kebab-case from script title or first headline, max 50 chars.
- **No em dashes:** strip U+2014 from any extracted reference. Replace with hyphens.
- **Image references:** if a slide template needs a photo, store it next to `slides.html` and reference relatively.

---

## Troubleshooting

- **Fonts not loading in PNG export:** html2canvas needs fonts loaded before capture. Wait for `document.fonts.ready` before enabling the download button. The page-shell handles this.
- **Text gets clipped:** check the slide root has `width: 1080px; height: 1350px; overflow: hidden`. Long copy may need a smaller variant of the template - generate one and add to the rotation pool.
- **PNG looks blurry:** html2canvas defaults to 1x. The shell sets `scale: 1` because slides are already at 1080×1350 native. If you bump display scale on screen for preview, exclude that from the capture target.
- **Rotation log missing:** treat as empty `{}` and proceed. Don't error.
- **CDN fonts blocked:** if the brand uses a third-party CDN font that fails CORS, fall back to the declared fallback chain. Never substitute a different font silently.
