# Typography

The reference work is built almost entirely on **two-typeface pairings**, with the occasional custom letterform reserved for the wordmark itself. The pairings fall into recognizable archetypes. Pick one. Do not mix three faces.

## The four working archetypes

### 1. Editorial serif + clean modern sans
The most common and most flexible pairing. The serif carries display moments (oversized headlines, pull quotes, brand name in body copy). The sans carries body, navigation, labels, captions.

| Role | Examples (free / open) | Examples (foundry) |
|---|---|---|
| Display serif | **Fraunces** (variable, expressive, contrast-rich) · **Playfair Display** (high-contrast didone) · **Cormorant Garamond** (literary, slender) · **EB Garamond** (warm, classical) | Canela (Commercial Type) · GT Sectra · Recoleta · Tiempos |
| Body sans | **Inter** (neutral, geometric) · **Manrope** (slightly warmer, geometric) · **DM Sans** (open, friendly) · **Geist Sans** (clean, contemporary) | Söhne · Founders Grotesk · GT America · Aktiv Grotesk |

Use when the seed leans editorial, literary, founder-as-thought-leader, wellness-meets-clinic, beauty, hospitality, fashion.

### 2. Sharp grotesk + soft serif
Inverted from #1: the sans is the workhorse for display *and* body, with a serif used sparingly as accent (a single quote, an italic word inside a headline, the word "&", an eyebrow label).

| Role | Examples (free / open) | Examples (foundry) |
|---|---|---|
| Workhorse grotesk | **Inter Tight** · **Geist** · **Space Grotesk** | GT America · Söhne · Söhne Mono |
| Accent serif (italic only) | **Instrument Serif** (italic is gorgeous) · **Cormorant Garamond Italic** · **Fraunces Italic** | Canela Text Italic · GT Sectra Fine Italic |

Use when the seed is contemporary, slightly tech, design-forward, agency-positioned. The italic serif word inside a sans headline is the move.

### 3. Custom wordmark + neutral sans system
The brand wordmark is a one-off (commissioned, drawn, or heavily customized). Everything else - body, nav, labels - sits in a single neutral sans. The discipline here is restraint: the wordmark is the only loud thing, and the rest of the type does not compete.

| Role | Examples (free / open) | Examples (foundry) |
|---|---|---|
| Wordmark | Custom only (drawn, commissioned, or modified existing face) | Custom only |
| System sans | **Inter** · **Geist** · **Manrope** | Söhne · Aktiv Grotesk · Founders Grotesk |

Use when budget allows custom type and the brand needs a singular signature mark (founder-led brands, niche-luxury, personal brands).

### 4. Mono + serif (rare, intentional)
A monospace face for labels and small copy paired with a serif for everything that matters. Reads as deliberate, almost technical-meets-literary.

| Role | Examples (free / open) | Examples (foundry) |
|---|---|---|
| Labels / small / nav | **JetBrains Mono** · **IBM Plex Mono** · **Space Mono** | GT America Mono · Söhne Mono |
| Display + body | **EB Garamond** · **Fraunces** · **Cormorant** | Tiempos · Canela · GT Sectra |

Use only when the brand has an editorial-meets-archival quality (independent press, archive, journal).

## Type scale

The reference work uses **dramatic** scale. Display sizes are 4-9% of viewport width. Body is comfortable, not small. There is no "medium" type - everything is either display or body, with one or two intermediate sizes for section headings.

A working scale (rem):
```
--type-eyebrow: 0.75rem    /* 12px - all caps, tracked +0.12em */
--type-body-sm: 0.875rem   /* 14px - captions */
--type-body:    1.0625rem  /* 17px - paragraph default */
--type-body-lg: 1.25rem    /* 20px - lead paragraphs */
--type-h3:      1.75rem    /* 28px - subheadings */
--type-h2:      2.75rem    /* 44px - section headings */
--type-h1:      clamp(3rem, 7vw, 7.5rem)  /* hero display */
```

Body line-height: 1.5-1.65. Display line-height: 0.95-1.05 (tight, almost touching).

## Tracking (letter-spacing)

A specific reference move:
- **Display headlines**: looser tracking, +0.005em to +0.02em. Counter-intuitive but correct - large type needs to breathe.
- **Body**: 0 tracking, default.
- **All-caps eyebrow labels**: +0.10em to +0.16em. Always.
- **Small body / captions**: 0 to +0.005em.

## Case usage

- **Display headlines**: sentence case usually, occasional all-lowercase for brand voice (signals confidence, slightly literary). Avoid all-caps for display - it flattens.
- **Section labels / eyebrows**: ALL CAPS, tracked, often with a thin horizontal rule above or below. The reference work labels sections OVERVIEW, SERVICES, PROCESS, CONTACT.
- **Body**: sentence case, always.
- **Pull quotes**: sentence case, italic if the body is roman, roman if the body is italic.

## Loading fonts in production

For Google Fonts, link in the document head and request only the weights you use:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

For commercial faces (Söhne, Canela, GT America), use `@font-face` with the licensed `.woff2` files. Never reach for `font-display: block` - use `swap` or `optional`.

For variable fonts, prefer them. Fraunces variable is one file, all weights and optical sizes - use the optical-size axis to make the same face read tighter at body and looser at display.

## What to never do

- Three or more typefaces on a page. The eye reads it as chaos.
- Display copy in a body weight. Display needs medium-to-bold contrast or a true display face.
- All-caps body copy. Anything longer than four words in caps is unreadable.
- Tracked-out body copy. Tracking is for caps and display only.
- Decorative scripts that are not the wordmark. Once outside the wordmark, you are in wedding-invitation territory.
- System fallbacks for the brand face. Either it is web-loaded properly or it is not the brand face.
