---
name: editorial-typography
description: Premium editorial typography for HTML and CSS. Use when generating any typography-heavy layout including strategy decks, sales pages, landing pages, about pages, or any content where type is the dominant design element. Covers type scales, font pairing, variable font axes, vertical rhythm, display sizes, italic usage, and the specific patterns used in the Web Design OS strategy deck.
---

# Editorial Typography

Typography is the single most important factor in whether a layout feels premium or cheap. This skill provides the patterns, rules, and specific code for generating editorial-quality typography in HTML/CSS.

## Core principle

Typography-driven design means letting type do the work instead of decorations. No drop shadows, no gradients on text, no decorative borders. The type itself carries all the visual weight through size, weight, style (italic vs roman), rhythm, and spacing.

If a layout feels weak, typography is almost always the cause. If a layout feels premium, typography is almost always the reason.

---

## Type scales

Never pick font sizes arbitrarily. Use a modular scale so every size relates harmoniously to every other size.

### Recommended scales

**Major Third (1.25) - Gentle, editorial**
```
10 → 12 → 15 → 19 → 24 → 30 → 37 → 46 → 58 → 72 → 90 → 113 → 141
```
Good for: magazine layouts, editorial strategy decks, refined sites

**Perfect Fourth (1.333) - Balanced, most versatile**
```
10 → 13 → 18 → 24 → 32 → 42 → 56 → 75 → 100 → 133
```
Good for: most sites, default choice

**Golden Ratio (1.618) - Dramatic, display-driven**
```
10 → 16 → 26 → 42 → 68 → 110 → 178
```
Good for: hero-driven sites, landing pages, fashion/luxury brands

### Practical application

For an editorial strategy deck, use Perfect Fourth with a 16px base:

```css
:root {
    --text-xs: 11px;      /* labels, captions */
    --text-sm: 13px;      /* small body */
    --text-base: 14px;    /* default body */
    --text-md: 16px;      /* large body */
    --text-lg: 20px;      /* lead */
    --text-xl: 28px;      /* small heading */
    --text-2xl: 40px;     /* heading */
    --text-3xl: 56px;     /* display */
    --text-4xl: 80px;     /* large display */
    --text-5xl: 120px;    /* hero */
    --text-6xl: 160px;    /* cover */
}
```

---

## Font pairing rules

### The classic pairings that always work

1. **Serif display + Sans body** (most versatile)
   - Fraunces + Inter
   - Playfair Display + Inter
   - GT Super Display + GT America
   - Canela + Söhne
   - Tiempos Headline + Söhne

2. **Sans display + Serif body** (editorial magazine)
   - Inter Tight + Lora
   - GT America + Tiempos Text
   - Söhne + Canela Text

3. **All-sans (modern tech)**
   - Inter for everything, use weight to differentiate
   - GT America (different weights for display and body)
   - Söhne (mix weights and widths)

4. **All-serif (traditional editorial)**
   - Fraunces for display + GT Super Text for body
   - Canela + Canela Text

### Rules for pairing

- **Never use three+ families** unless you really know what you're doing
- **Contrast matters more than matching** - pair a distinctive display with a neutral body
- **Body font should be highly legible at 14-16px** - don't pick a quirky serif for body
- **Display font should have character** - if both your fonts are neutral, the design feels flat
- **Check the x-height ratio** - fonts with similar x-heights feel balanced together

### Variable fonts are better

Variable fonts let you use a single font file with multiple axes (weight, optical sizing, width, slant, italic). They render faster and give you more typographic control.

**Best variable fonts for editorial web design:**
- **Fraunces** - serif with optical sizing, softness, weight, italic axes
- **Inter** - sans with weight and slant axes (the tech default)
- **Recursive** - sans/mono with multiple axes for technical aesthetics
- **Fraunces + Inter is the current best default** for premium editorial work

---

## Variable font axes (Fraunces specifically)

Fraunces is the recommended serif for this product. It has these axes:

- **Weight (wght):** 100-900. Use 300 for large display, 400 for body-sized display, 500 for emphasis
- **Optical size (opsz):** 9-144. Lower values (9-24) tighten for body text. Higher values (60-144) loosen for display. Always use the appropriate optical size for the font size being rendered.
- **Softness (SOFT):** 0-100. 0 is sharp/formal. 100 is soft/friendly. Use 30-50 for most editorial work.
- **Italic (ital):** 0 or 1. Use italic for emphasis in headings, not for body.

### Loading Fraunces with specific axes

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,400&display=swap" rel="stylesheet">
```

This loads: regular weights 300/400/500 and italic 400, all with the full optical sizing range.

### Using optical sizing in CSS

```css
.hero-title {
    font-family: 'Fraunces', serif;
    font-size: 120px;
    font-variation-settings: 'opsz' 144, 'wght' 300, 'SOFT' 30;
    line-height: 0.9;
    letter-spacing: -0.02em;
}

.body-text {
    font-family: 'Fraunces', serif;
    font-size: 14px;
    font-variation-settings: 'opsz' 14, 'wght' 400, 'SOFT' 50;
    line-height: 1.65;
    letter-spacing: 0;
}
```

---

## Line height rules

Line height should change based on font size.

| Font size | Line height | Use case |
|---|---|---|
| 10-12px | 1.4-1.5 | Small labels, captions |
| 13-16px | 1.55-1.7 | Body text |
| 17-22px | 1.4-1.5 | Lead paragraphs, callouts |
| 24-40px | 1.2-1.35 | Subheadings |
| 40-72px | 1.0-1.15 | Headings |
| 72px+ | 0.85-1.0 | Display / hero |

**Never use line-height > 1.75 for body text** - it loses rhythm.
**Never use line-height < 0.85 for display** - descenders clash.

---

## Letter spacing rules

Letter spacing (tracking) is size-dependent.

| Context | Letter spacing |
|---|---|
| Body text | 0 (default) |
| Large body / lead | -0.005em to 0 |
| Subheadings | -0.005em to -0.01em |
| Headings | -0.01em to -0.02em |
| Display / hero | -0.02em to -0.03em |
| Small uppercase labels | 0.15em to 0.25em |
| Large uppercase (rare) | 0.05em to 0.1em |

**Rule of thumb:** The larger the type, the tighter the tracking. The smaller the type, the looser the tracking. Uppercase always needs more tracking than lowercase.

---

## Hierarchy principles

Strong hierarchy means the reader always knows what to look at next. Weak hierarchy makes designs feel flat and unprofessional.

### The 3-level minimum

Every page should have at minimum:
1. **Primary** - the one thing the reader should see first (hero title, page title)
2. **Secondary** - the supporting information (subtitles, section headers)
3. **Tertiary** - the body content, labels, metadata

### Creating hierarchy with type

Use a combination of:
- **Size** - bigger = more important
- **Weight** - bolder = more important
- **Style** - italic can be a secondary emphasis
- **Colour** - black on white = primary, greys = secondary
- **Position** - top-left = primary in Western reading order
- **Space around it** - more breathing room = more important

**Never rely on size alone.** A 120px title next to 14px body has big size contrast but no other contrast. Add weight, style, or spacing to strengthen hierarchy.

### The uppercase label pattern

Small uppercase labels with wide letter spacing are a signature editorial move:

```css
.eyebrow {
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #666;
}
```

Use above headings to categorize them. Looks expensive.

---

## Italic usage in display

Italic in serif display fonts creates sophistication. Use it sparingly and intentionally:

**Good uses:**
- One word in a heading to draw focus: "The <em>Transformation</em>"
- Emphasizing a concept: "Brand <em>Strategy</em>"
- Creating rhythm: "We don't just <em>build</em> websites."

**Bad uses:**
- Whole sentences in italic (looks like a quote instead of display)
- Every heading italicized (loses impact)
- Italic in body text without a reason

### Pattern for mixed italic/roman display

```html
<h1 class="display">
    Brand <em>Strategy</em>
</h1>
```

```css
.display {
    font-family: 'Fraunces', serif;
    font-weight: 300;
    font-variation-settings: 'opsz' 144;
    font-size: 120px;
    line-height: 0.95;
}
.display em {
    font-style: italic;
    font-weight: 300;
}
```

---

## Responsive typography

Use `clamp()` for fluid sizing:

```css
.hero {
    font-size: clamp(56px, 10vw, 160px);
    line-height: 0.9;
}
```

- First value: minimum size (mobile)
- Second value: preferred size (scales with viewport)
- Third value: maximum size (desktop)

For editorial decks that are viewed at fixed sizes (like the strategy deck template), don't use clamp - use fixed sizes optimized for the page dimensions.

---

## Typography checklist

Before calling any typography work done, verify:

- [ ] Type scale is based on a ratio (not arbitrary sizes)
- [ ] Display sizes are 80px+
- [ ] Body sizes are 14-16px
- [ ] Line height adjusts based on size
- [ ] Letter spacing adjusts based on size
- [ ] Hierarchy uses 3+ levels
- [ ] Italic is used intentionally, not randomly
- [ ] Font pairing is serif+sans or all-sans or all-serif (never random)
- [ ] Max 2 font families
- [ ] Uppercase labels use letter-spacing 0.15em+
- [ ] Negative letter spacing on large display (-0.01 to -0.03em)
- [ ] No em dashes (use - instead, Web Design OS rule)
- [ ] Vertical rhythm feels balanced (not cramped, not floating)

---

## Reference patterns for Web Design OS

These are the exact typography tokens used throughout the Web Design OS strategy deck and website templates:

```css
:root {
    /* Font families */
    --serif: 'Fraunces', Georgia, serif;
    --sans: 'Inter', -apple-system, sans-serif;

    /* Size scale */
    --text-xs: 11px;
    --text-sm: 13px;
    --text-base: 14px;
    --text-md: 16px;
    --text-lg: 22px;
    --text-xl: 28px;
    --text-2xl: 36px;
    --text-3xl: 56px;
    --text-4xl: 80px;
    --text-5xl: 128px;
}

/* Display (hero title) */
.display-xl {
    font-family: var(--serif);
    font-weight: 300;
    font-size: var(--text-5xl);
    line-height: 0.9;
    letter-spacing: -0.02em;
    font-variation-settings: 'opsz' 144;
}

/* Large display */
.display-lg {
    font-family: var(--serif);
    font-weight: 400;
    font-size: var(--text-4xl);
    line-height: 1;
    letter-spacing: -0.015em;
    font-variation-settings: 'opsz' 100;
}

/* Medium display */
.display-md {
    font-family: var(--serif);
    font-weight: 400;
    font-size: var(--text-3xl);
    line-height: 1.05;
    letter-spacing: -0.01em;
    font-variation-settings: 'opsz' 60;
}

/* Heading */
.heading {
    font-family: var(--serif);
    font-weight: 400;
    font-size: var(--text-xl);
    line-height: 1.2;
    font-variation-settings: 'opsz' 36;
}

/* Eyebrow label */
.eyebrow {
    font-family: var(--sans);
    font-size: var(--text-xs);
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
}

/* Lead paragraph */
.lead {
    font-family: var(--serif);
    font-size: var(--text-lg);
    font-weight: 300;
    font-style: italic;
    line-height: 1.45;
    letter-spacing: -0.005em;
}

/* Body */
.body {
    font-family: var(--sans);
    font-size: var(--text-base);
    font-weight: 400;
    line-height: 1.65;
}

/* Small body / captions */
.caption {
    font-family: var(--sans);
    font-size: var(--text-xs);
    font-weight: 400;
    line-height: 1.5;
    color: #666;
}
```

Use these as the starting point for any new typography work in the product.
