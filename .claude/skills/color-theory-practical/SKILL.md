---
name: color-theory-practical
description: Practical colour theory for brand design and web design systems. Use when creating colour palettes, generating brand colour systems, choosing colours for creative direction, checking accessibility contrast, or generating dark mode variants. Covers colour psychology by industry, WCAG accessibility, HSL palette generation, warm vs cool neutrals, and avoiding generic startup palettes.
---

# Practical Colour Theory

Colour is the second most important visual factor after typography. Bad colour choices make good layouts look cheap. Good colour choices make average layouts look expensive.

This skill focuses on practical application, not theory. The goal is choosing colour combinations that work in real brand systems, not memorizing the colour wheel.

---

## Core principle

Most brands need fewer colours than people think. A premium brand palette has:
- 1 primary colour (the signature)
- 2-3 supporting colours
- 2-3 neutrals
- That's it.

Generic palettes try to give you every colour for every use case. Premium palettes commit to a specific mood and stick with it.

---

## Colour psychology by industry

Different industries have different colour conventions. Work with or against them intentionally.

### Wellness / Health / Natural
- **Default:** sage greens, warm terracottas, soft creams, muted olives
- **Avoid:** neon, bright cyan, pure primary colours
- **Feel:** grounded, natural, trustworthy

### Tech / Startups
- **Default:** electric blue, teal, purple, pure white
- **Avoid:** browns, oranges, muted palettes (unless you want to feel different)
- **Feel:** modern, innovative, reliable
- **Trap:** every tech startup uses the same blue - consider a different angle

### Luxury / Fashion
- **Default:** black, cream, gold accents, deep burgundy
- **Avoid:** bright saturated colours, rainbow palettes
- **Feel:** exclusive, refined, timeless

### Creative / Editorial
- **Default:** black, white, one accent colour (often unexpected)
- **Avoid:** generic palettes, too many colours
- **Feel:** considered, confident, artistic

### Food / Hospitality
- **Default:** warm neutrals, terracotta, deep greens, cream
- **Avoid:** blues and cool tones (feels uninviting for food)
- **Feel:** warm, appetizing, inviting

### Finance / Professional Services
- **Default:** deep blues, charcoal, cream, gold accents
- **Avoid:** bright pinks, lime green, chaotic palettes
- **Feel:** trustworthy, established, competent

### Fitness / Sports
- **Default:** high contrast (black/white + one bold accent), saturated primaries
- **Avoid:** pastels, low-contrast palettes
- **Feel:** energetic, bold, motivating

**Key insight:** Work WITH the industry conventions unless you have a specific reason to break them. Breaking conventions is a strategic decision, not an accident.

---

## WCAG accessibility (required)

Every colour combination must pass WCAG contrast requirements. Non-negotiable.

### Contrast ratio requirements

| Level | Normal text (< 18px) | Large text (≥ 18px bold, ≥ 24px regular) |
|---|---|---|
| AA (minimum) | 4.5:1 | 3:1 |
| AAA (enhanced) | 7:1 | 4.5:1 |

**Web Design OS defaults to AA.** Aim for AAA when possible, especially for long-form content.

### Quick checking

Use a contrast checker (e.g. WebAIM Contrast Checker). Any colour combination should be tested before being committed to a palette.

### Common failures

- Light grey text on white (fails - use #666 minimum, ideally #444)
- Coloured text on coloured backgrounds (often fails - test every combination)
- White text on yellow or light accent colours (almost always fails)
- Thin grey lines on white (fails - use #DDD minimum, ideally #CCC)

### Dark mode challenges

Dark mode contrast is harder. Rules:
- Don't use pure white on pure black (too harsh - use #F5F5F5 on #1A1A1A)
- Don't use the same accent colour - often needs to be lighter in dark mode
- Test all text/background combinations separately

---

## HSL for palette generation

HSL (Hue, Saturation, Lightness) is the best colour system for thinking about palettes because it matches how designers actually think.

- **Hue (0-360):** The colour itself (red, blue, green)
- **Saturation (0-100%):** How intense the colour is
- **Lightness (0-100%):** How light or dark the colour is

### Generating a palette from a single colour

Start with one colour (often the primary brand colour). Generate the rest by keeping hue constant and varying saturation/lightness.

**Example: primary is `hsl(25, 65%, 55%)` (warm orange)**

```
primary:     hsl(25, 65%, 55%)  /* the signature colour */
primary-dark: hsl(25, 70%, 40%)  /* for hover states, darker variants */
primary-light: hsl(25, 55%, 75%) /* for backgrounds, tints */
primary-pale: hsl(25, 40%, 92%)  /* for very subtle backgrounds */
```

Keep hue similar, vary saturation and lightness. All four colours feel like part of the same family.

### Generating complementary colours

Use hue rotation:
- **Complementary:** +180° (opposite)
- **Triadic:** +120° and +240° (three equidistant)
- **Split-complementary:** +150° and +210°
- **Analogous:** +30° and -30° (adjacent on wheel)

**Most premium palettes use analogous + neutral**, not complementary. Complementary colours are high contrast but can feel garish.

---

## The 60-30-10 rule

A balanced palette uses three colours in these proportions:

- **60% neutral** (backgrounds, mostly)
- **30% secondary** (supporting UI, secondary backgrounds)
- **10% primary** (calls to action, accents, highlights)

**The mistake most beginners make:** Using the primary brand colour for 60% of the design. This overwhelms and makes the primary less special.

**The fix:** Let neutrals dominate. Use the primary colour sparingly for maximum impact.

---

## Neutrals that don't feel cheap

Most designers use pure `#FFFFFF` and pure `#000000`. This is the fastest way to make a design feel generic.

### Warm neutrals (most versatile)

```css
--paper: #FAFAF7;      /* warm off-white, the editorial default */
--paper-warm: #F5F3ED;  /* slightly warmer */
--ink: #0A0A0A;         /* nearly-black, not pure black */
--ink-soft: #1A1A1A;    /* soft dark for body text */
--ink-mute: #666666;    /* muted grey for captions */
--ink-faint: #999999;   /* very light for placeholder text */
```

### Cool neutrals (tech, clinical)

```css
--canvas: #F8F9FA;      /* cool off-white */
--ink: #0F1419;         /* nearly-black with cool undertone */
--ink-soft: #202125;    /* cool dark for body */
--ink-mute: #5F6368;    /* cool grey */
```

### Why off-white and off-black matter

Pure white on screens is harsh and fatiguing to read. Pure black next to a bright primary colour can feel muddy. Off-white and off-black are easier on the eyes and look more intentional.

**Rule:** Never use `#FFFFFF` or `#000000` unless you have a specific reason.

---

## Dark mode from light mode

Dark mode isn't just "invert the colours." It requires a different palette with different rules.

### Rules for creating dark mode from a light palette

1. **Background:** Not pure black. Use `#0A0A0A` or `#111111`.
2. **Surface:** Slightly lighter than background. Use `#1A1A1A` for cards/panels.
3. **Text:** Not pure white. Use `#F5F5F5` or `#E5E5E5`.
4. **Primary colour:** Often needs to be lighter/brighter to show up against dark backgrounds. If your light-mode primary is `#E85D2F`, dark-mode primary might be `#FF7A4D`.
5. **Neutral greys:** Invert their lightness in HSL, keep hue constant.

### CSS custom property pattern

```css
:root {
    --bg: #FAFAF7;
    --surface: #FFFFFF;
    --text: #0A0A0A;
    --text-muted: #666666;
    --border: #E5E5E0;
    --primary: #E85D2F;
}

@media (prefers-color-scheme: dark) {
    :root {
        --bg: #0A0A0A;
        --surface: #1A1A1A;
        --text: #F5F5F5;
        --text-muted: #AAAAAA;
        --border: #2A2A2A;
        --primary: #FF7A4D;
    }
}
```

---

## Brand colour vs UI colour

Some colours are for the brand identity. Others are for the UI. Don't confuse them.

### Brand colours
- Primary, secondary, accent
- Used for identity, hero elements, CTAs
- Saturated, distinctive, memorable

### UI colours
- Success (green), warning (yellow), error (red), info (blue)
- Used for system feedback
- Should be consistent across projects
- Don't need to match the brand identity

**Both must work together.** If the brand primary is green, the success green needs to be distinguishable (maybe a different shade or context).

---

## Avoiding generic startup palettes

Generic tech startup colour palette:
- Bright blue `#4285F4`
- Pure white `#FFFFFF`
- Light grey `#F5F5F5`
- Dark grey `#1F2937`

If your palette looks like this, you're making a generic product.

### How to avoid it

1. **Start from an unexpected colour.** Instead of defaulting to blue, explore terracotta, sage, mustard, navy, olive, deep plum.

2. **Use warm neutrals instead of cool greys.** `#FAFAF7` instead of `#F5F5F5`.

3. **Desaturate your primary.** `hsl(25, 50%, 55%)` feels more sophisticated than `hsl(25, 90%, 55%)`.

4. **Add an unexpected accent.** A warm neutral palette + one sage green accent feels more designed than another all-warm palette.

5. **Look at print design.** Book covers, magazine spreads, fashion lookbooks have better palettes than most websites.

---

## Palette naming conventions

Name colours by their role, not their appearance. This makes palettes portable across designs.

### Bad naming
```css
--orange: #E85D2F;
--light-grey: #F5F5F5;
--dark-grey: #1F2937;
```

### Good naming
```css
--primary: #E85D2F;
--surface: #F5F5F5;
--ink: #1F2937;
```

When the client later decides their primary colour should be green instead, you change the value but not the name.

---

## Colour in different contexts

### For large backgrounds
Use neutral or very desaturated colours. Large areas of saturated colour feel overwhelming.

### For text
High contrast, high legibility. Dark text on light background is easiest. Never colour body text (except muted grey for secondary text).

### For CTAs
The most saturated, highest-contrast colour in your palette. This is the colour your eye should be drawn to.

### For accents
Used sparingly. Highlighting specific elements (pull quotes, featured text, icons).

### For backgrounds of content blocks
Subtle tints of your primary, or warm/cool neutrals. Never the primary at full saturation.

---

## Testing a palette

Before committing to a palette, test these combinations:

- [ ] Primary text on primary background (body readable?)
- [ ] Primary text on surface background (body readable?)
- [ ] Muted text on primary background (secondary info readable?)
- [ ] CTA button (primary colour) on white background (visible enough?)
- [ ] CTA button on dark background (still visible?)
- [ ] Link colour on body text (distinguishable but not jarring?)
- [ ] Error/warning colours on both backgrounds
- [ ] All colours checked for AA contrast

---

## Generating palettes from a brand mood

When creating a palette from a brand brief, follow this process:

1. **Identify the mood adjectives** - what feeling does the brand want?
2. **Look at reference brands with similar moods** - what colours do they use?
3. **Pick a primary colour that reinforces the mood** - warm for friendly, cool for clinical, muted for refined, saturated for energetic
4. **Add neutrals that support the mood** - warm neutrals for friendly, cool for modern, off-black instead of pure black for refined
5. **Add a surprise accent** - one colour that breaks the obvious pattern
6. **Test all combinations** - accessibility and aesthetic
7. **Remove colours until you can't remove any more** - fewer colours = stronger brand

---

## Example palette generation

**Brief:** Wellness brand, feels grounded and natural, targets high-income women, premium positioning.

**Thought process:**
- Mood: grounded → earthy neutrals
- Natural → not tech blues
- Premium → desaturated, sophisticated
- Women-focused → can use soft tones without feeling masculine
- Avoid: terracotta (too expected for wellness), sage green (too expected for wellness)
- Instead: deep olive, warm cream, unexpected dusty rose accent

**Palette:**
```css
--primary: #5A6847;        /* deep olive, grounded */
--primary-dark: #3D4730;    /* darker variant */
--primary-light: #8A9673;   /* lighter variant for tints */
--accent: #D4918B;          /* dusty rose accent (unexpected) */
--cream: #F5F0E8;           /* warm cream background */
--ink: #1F1C17;             /* warm off-black */
--ink-muted: #5A5550;       /* warm muted grey */
--border: #E0D9CD;          /* subtle border */
```

This feels more designed than the generic "wellness brand = sage green" approach.

---

## Quick reference: colour choices that almost always work

- **Deep navy + warm cream + single warm accent** (editorial, refined)
- **Off-white + near-black + single saturated accent** (modern, confident)
- **Warm sand + terracotta + deep green** (natural, warm)
- **Charcoal + sage + cream** (refined, natural)
- **Cream + black + one unexpected jewel tone** (luxury)

When stuck, start with one of these and adjust.
