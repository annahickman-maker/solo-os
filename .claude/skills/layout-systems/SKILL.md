---
name: layout-systems
description: CSS Grid, Flexbox, and editorial layout patterns for premium web design. Use when building any multi-section page, magazine-style layout, hero with supporting content, image grid, moodboard, or responsive layout. Covers grid systems, aspect ratio handling, asymmetric balance, negative space, responsive patterns, and the specific layouts used in the Web Design OS product.
---

# Layout Systems

Layout is the skeleton of every design. This skill covers the grid systems, CSS patterns, and editorial layout techniques needed to build layouts that feel considered rather than chaotic.

## Core principle

Every element on a page should sit on a grid. Nothing floats randomly. The grid can be visible or invisible, strict or loose, but it must exist. Layouts that feel "off" almost always have elements that ignore the underlying grid.

---

## Grid fundamentals

### When to use CSS Grid vs Flexbox

**Use Grid when:**
- Laying out 2D content (rows AND columns)
- Defining explicit structure (specific column widths)
- Building page-level layouts
- Creating asymmetric layouts
- Placing items precisely

**Use Flexbox when:**
- Aligning content in a single row or column
- Distributing space between items
- Building component-level layouts (cards, buttons, nav)
- Centering things
- Reordering items responsively

**Use both:** Most real layouts use Grid for the page structure and Flexbox within individual components.

---

## The 12-column baseline grid

12 columns divides cleanly into 2, 3, 4, 6 equal groups, making it the most flexible starting point.

```css
.container {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 24px;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 40px;
}

.col-12 { grid-column: span 12; }
.col-8 { grid-column: span 8; }
.col-6 { grid-column: span 6; }
.col-4 { grid-column: span 4; }
.col-3 { grid-column: span 3; }
```

**When to use 12-column:** Marketing sites, landing pages, content-driven designs.

---

## Asymmetric grids (editorial)

Magazine-style layouts use asymmetric grids to create visual interest. Instead of equal columns, use ratios.

### Common asymmetric patterns

**1:2 split (sidebar + main)**
```css
.editorial-layout {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 48px;
}
```

**2:3 split (image + text)**
```css
.magazine-layout {
    display: grid;
    grid-template-columns: 2fr 3fr;
    gap: 64px;
}
```

**Golden ratio (1:1.618)**
```css
.golden-layout {
    display: grid;
    grid-template-columns: 1fr 1.618fr;
    gap: 48px;
}
```

**Vertical title + content (signature move)**
```css
.vertical-title-layout {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 80px;
    height: 100%;
    align-items: center;
}

.vertical-title {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-family: 'Fraunces', serif;
    font-size: 80px;
    line-height: 1;
}
```

---

## Aspect ratio handling

Modern CSS has native aspect-ratio support. Use it for predictable image layouts.

```css
.image-slot {
    aspect-ratio: 16 / 9;    /* landscape hero */
}

.portrait-slot {
    aspect-ratio: 3 / 4;     /* portrait imagery */
}

.square-slot {
    aspect-ratio: 1 / 1;     /* square */
}

.ultrawide-slot {
    aspect-ratio: 21 / 9;    /* cinematic */
}

.image-slot img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
```

**object-fit: cover** is almost always what you want for hero images - it fills the container without distortion.

**object-fit: contain** is for when you need to see the whole image (logos, portraits with specific framing).

---

## Masonry / bento grid patterns

For moodboards and image galleries with mixed aspect ratios.

### CSS Grid masonry (modern browsers)

```css
.moodboard {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 12px;
    height: 600px;
}

/* Feature images span multiple cells */
.moodboard-large {
    grid-row: span 2;
    grid-column: span 2;
}

.moodboard-tall {
    grid-row: span 2;
}

.moodboard-wide {
    grid-column: span 2;
}
```

This creates a deliberate, magazine-style grid rather than random masonry.

### The bento box pattern

For feature pages where different items need different prominence:

```css
.bento {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(4, 200px);
    gap: 16px;
}

.bento-hero {
    grid-column: 1 / 3;
    grid-row: 1 / 3;
}

.bento-feature {
    grid-column: 3 / 5;
    grid-row: 1 / 2;
}

/* etc. - each item gets a specific position */
```

---

## Full-bleed section dividers

Full-width imagery with content overlay. Common for section dividers and heroes.

```css
.full-bleed-section {
    position: relative;
    width: 100%;
    height: 100vh;
    overflow: hidden;
    color: white;
}

.full-bleed-image {
    position: absolute;
    inset: 0;
    z-index: 0;
}

.full-bleed-image::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%);
    z-index: 1;
}

.full-bleed-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.full-bleed-content {
    position: relative;
    z-index: 2;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 60px;
}
```

**Key details:**
- Use `inset: 0` instead of `top/left/right/bottom: 0` (cleaner)
- Always add a gradient overlay for text legibility
- Gradient direction depends on where text sits (darker at text position)
- `object-fit: cover` on the image prevents distortion

---

## Editorial layout patterns

### Pattern 1: Two-column editorial (text left, image right)

```css
.editorial-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 80px;
    align-items: center;
    min-height: 600px;
}
```

Proportions to try:
- 1:1 (balanced)
- 2:3 (text narrower, image larger)
- 3:2 (text wider, image smaller)
- 5:7 (golden ratio-ish)

### Pattern 2: Hero with supporting detail

```css
.hero-detail {
    display: grid;
    grid-template-rows: 2fr 1fr;
    gap: 40px;
    height: 100%;
}
```

Hero image on top, supporting content below. Hero takes 2/3, content takes 1/3.

### Pattern 3: Asymmetric three-column

```css
.asymmetric-three {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    gap: 48px;
}
```

Wider middle column gets the primary content. Side columns for metadata, navigation, or secondary images.

### Pattern 4: The editorial quote

```css
.editorial-quote {
    display: grid;
    grid-template-columns: 1fr 3fr 1fr;
    gap: 0;
}

.editorial-quote blockquote {
    grid-column: 2;
    padding: 80px 0;
}
```

Center-aligned quote with natural margins from an invisible grid.

---

## Vertical rhythm

Vertical rhythm means consistent spacing that creates a musical flow down the page.

### Spacing scale (use this everywhere)

```css
:root {
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 16px;
    --space-4: 24px;
    --space-5: 32px;
    --space-6: 48px;
    --space-7: 64px;
    --space-8: 96px;
    --space-9: 128px;
    --space-10: 192px;
}
```

**Rules:**
- Component-level spacing: use 4-32px (steps 1-5)
- Section-level spacing: use 48-128px (steps 6-9)
- Between major sections: 128-192px (steps 9-10)
- Never use arbitrary values like 37px or 53px - stick to the scale

### Margin collapsing trap

When two block elements stack, their margins collapse to the larger value. Avoid this by using padding on parent containers or flex/grid gap instead of margins:

```css
/* Bad - margins can collapse */
.section {
    margin-bottom: 80px;
}

/* Good - gap is predictable */
.sections {
    display: flex;
    flex-direction: column;
    gap: 80px;
}
```

---

## Negative space as a design element

Empty space isn't wasted space. In editorial design, negative space is what makes elements feel important.

**Rules:**
- Give important elements LOTS of surrounding space
- Pages don't need to be "full" - empty areas add sophistication
- Dense pages should be balanced by sparse pages
- The rhythm of dense/sparse creates pacing through a document

**Example: a value proposition page**

```css
.value-prop-page {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 60px;
}

.value-prop-content {
    max-width: 600px; /* narrow, surrounded by space */
    text-align: left;
}
```

Large page, small content, huge margins. Feels expensive.

---

## Responsive patterns

### Container queries (modern approach)

```css
.component {
    container-type: inline-size;
}

@container (min-width: 600px) {
    .component-layout {
        grid-template-columns: 1fr 1fr;
    }
}
```

Container queries adapt to the component's parent size, not the viewport. Better for modular layouts.

### Media queries (traditional)

```css
.layout {
    grid-template-columns: 1fr;
    gap: 32px;
}

@media (min-width: 768px) {
    .layout {
        grid-template-columns: 1fr 1fr;
        gap: 48px;
    }
}

@media (min-width: 1200px) {
    .layout {
        grid-template-columns: 1fr 2fr;
        gap: 80px;
    }
}
```

### Mobile-first vs desktop-first

**Mobile-first is the default** - start with single column, add complexity at larger sizes. Reverses the logic but results in simpler CSS.

For strategy decks and print-oriented documents, desktop-first might make more sense since the design is meant for large-screen viewing.

---

## Common mistakes to avoid

### 1. Forgetting to set `height: 100%` on the parent
Grid rows with `fr` units need a parent with defined height to work properly.

### 2. Using absolute positioning when grid would work
Absolute positioning takes elements out of the flow and creates brittle layouts. Use grid areas instead.

### 3. Not setting `min-width: 0` on grid items
Text in grid columns can overflow if you don't set `min-width: 0`. This is because the default minimum content size is `auto`.

```css
.grid-item {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

### 4. Using percentages when fr would work
`fr` units are designed for grid. They're easier to reason about than percentages.

```css
/* Bad */
grid-template-columns: 33.333% 33.333% 33.333%;

/* Good */
grid-template-columns: 1fr 1fr 1fr;
/* Or */
grid-template-columns: repeat(3, 1fr);
```

### 5. Centering with margin: auto instead of place-items
```css
/* Old way */
.parent {
    display: flex;
}
.child {
    margin: auto;
}

/* Better */
.parent {
    display: grid;
    place-items: center;
}
```

---

## The layout checklist

Before calling any layout done:

- [ ] Everything is on a visible or invisible grid
- [ ] Spacing uses a defined scale (not arbitrary px values)
- [ ] Aspect ratios are set for all image containers
- [ ] Hierarchy is clear (primary, secondary, tertiary)
- [ ] Negative space is intentional, not accidental
- [ ] Responsive breakpoints are tested
- [ ] No horizontal scrolling at any breakpoint
- [ ] Text has max-width set (never full-width body text)
- [ ] Images use object-fit
- [ ] Full-bleed sections have text overlay handled properly
- [ ] Vertical rhythm feels balanced

---

## The "max-width for body text" rule

**Never let body text stretch full-width.** Readable line length is 45-75 characters (about 600-750px depending on font size).

```css
.prose {
    max-width: 65ch; /* ch = character width */
    margin: 0 auto;
}
```

Using `ch` units automatically adjusts max-width based on font size. Perfect for readable body content.
