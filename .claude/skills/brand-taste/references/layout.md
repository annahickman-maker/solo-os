# Layout, grid, and rhythm

The reference work is **not dense**. It uses generous vertical rhythm, oversized type relative to the viewport, and image-led sections that breathe. The grid is disciplined; the breaks from the grid are deliberate.

## The grid

A 12-column grid is the working default. Gutters: 24-32px on desktop, 16-20px on tablet, 16px on mobile. Outer page padding: clamp(20px, 4vw, 96px) - generous on desktop, snug on mobile.

Container max-width: 1440-1600px. Wider than typical SaaS sites because hero photography and editorial type need room.

```css
:root {
  --container-max: 1520px;
  --gutter: clamp(16px, 2vw, 32px);
  --page-pad: clamp(20px, 4vw, 96px);
}
.container {
  max-width: var(--container-max);
  margin-inline: auto;
  padding-inline: var(--page-pad);
}
```

## Spacing tokens (the rhythm)

The reference work spaces sections far apart. Most "average" sites compress section spacing to 64-80px and feel cluttered as a result. Use a wider scale.

```css
:root {
  --space-1: 8px;     /* tight inline */
  --space-2: 16px;    /* paragraph spacing */
  --space-3: 24px;    /* element spacing */
  --space-4: 40px;    /* small section internal */
  --space-5: 64px;    /* section internal */
  --space-6: 96px;    /* between subsections */
  --space-7: 160px;   /* between major sections */
  --space-8: 240px;   /* hero-to-first-section, brand-defining gaps */
}
```

Use `--space-7` (160px) between major sections by default on desktop. Compress to `--space-6` (96px) on tablet, `--space-5` (64px) on mobile.

This is the single biggest tell of taste. Sites that feel premium are *spaced out*. Sites that feel templated are crammed.

## Vertical rhythm rules

- Type leading and section spacing should feel like the same family. Both generous.
- The hero almost always has a full viewport height (`min-height: 88-100vh`) with the headline placed in the lower-left or lower-center third, not the top. Lots of room above.
- After the hero, the first section is preceded by `--space-7` or `--space-8`. The page should "breathe in" before saying its first thing.
- Between a heading and its body: `--space-3` (24px) or `--space-4` (40px). Not 8px. Not 12px.
- Between paragraphs: `--space-2` (16px) for body, `--space-3` (24px) for lead/large body.

## Image-and-text section patterns

The reference work uses a small set of section archetypes. Pick from this list; do not invent.

### A. Full-bleed hero
Single photograph filling the viewport, headline overlaid bottom-left or below image. This is the page's first frame.

### B. Centered editorial paragraph
A single paragraph in narrow measure (45-65 characters wide), centered horizontally on the page, with `--space-7` above and below. No image, no decoration. Used for the brand thesis statement, usually placed as the first section after the hero.

```html
<section class="thesis">
  <p>One paragraph, narrow measure, doing the heavy lifting.
  Confident, second person, one strong idea per paragraph.</p>
</section>
```

```css
.thesis {
  max-width: 56ch;
  margin: var(--space-8) auto;
  font-size: var(--type-body-lg);
  line-height: 1.55;
}
```

### C. Asymmetric image + text
Photograph spans 7-8 columns of the 12-column grid, text spans 4 columns offset to the opposite side, vertically aligned to a specific point in the image (not always center). Wide gutter between (at least 80px on desktop).

### D. Two-image diptych
Two photographs side by side, no text in the section, generous space above and below. Lets the imagery do the work alone.

### E. Pull quote / brand statement
Oversized type (3-5rem), max-width 18-22ch, set as a single line per breakpoint where possible. Often italicized if a serif is in use. Surrounded by `--space-7` of breathing room.

### F. Section-scale photograph + headline overlay
Single image, full-bleed or near-full-bleed (10-12 columns), with headline laid into negative space within the image itself. Type contrasts with the image's tonal area.

### G. Long-form paragraph + side-pulled image
Body copy in narrow measure (left column, 5-6 cols) with a single image pulled to the right (right column, 4-5 cols), often vertically smaller than the text block.

### H. Contact-sheet row
Five or six small images in a row, full-bleed across the page, all in matching grade and lighting. Used for "process," "behind the scenes," or "details."

That is the entire vocabulary. Do not add a "three feature cards in a row" section. Do not add an "icon grid." If you want to express three benefits, write them as three sentences in section B.

## Where to break the grid

Editorial sites earn impact by occasional, deliberate grid breaks:

- A photograph that bleeds past the container into the page padding (or fully edge-to-edge while text stays contained).
- A headline that drops a word into the margin (`margin-left: -8vw`).
- An image rotated 2-4 degrees or pinned with a slight offset, like a photo on a wall.
- A section with `--space-8` (240px) above or below, when the section before/after is brand-defining.

These breaks are rare and deliberate. One or two per page maximum. If every section is breaking the grid, the grid is meaningless.

## Responsive behavior

The reference work is mobile-first in usability but desktop-first in feel - the desktop version is where the editorial composition lives, and mobile is a respectful adaptation, not an inverted "stack everything to one column."

Specifically on mobile:
- Display type stays large (`clamp(2.5rem, 12vw, 4rem)` for hero is fine on phone)
- Spacing compresses but does not collapse - keep `--space-5` (64px) between sections minimum
- Images go full-bleed (edge-to-edge of the viewport, no side padding)
- Body type stays at 17-18px - do not shrink to 14px on mobile

## The header / nav

Light. Almost not there. The reference work uses:
- Wordmark left, 3-5 nav links right (or right + a single CTA)
- Either fixed at top with a transparent-to-solid scroll transition, or static and disappearing on scroll
- No drop shadows under the nav. No "frosted backdrop blur." If you must distinguish nav from content, use a 1px hairline border.
- Mobile: hamburger that opens to a full-page overlay (cream background, oversized link list, single accent color for the active state)

## The footer

Quiet. Cream or deep-ink background. Three columns max: brand wordmark + tagline left, link columns center, contact + socials right. Generous padding. No "Subscribe to our newsletter!" form unless the brief says so. No legal-doc-dump.

## Anti-patterns specific to layout

- Centered everything (centered hero, centered cards, centered everything below). One centered moment per page is plenty.
- Three-column feature grids with icons. The single most generic section in web design.
- Floating CTAs / sticky bars. Editorial sites do not nag the reader.
- Multiple parallax layers. Adds noise, not depth.
- Dense above-the-fold ("hero with logos with three benefits with email signup all visible at first paint"). Editorial sites give the hero a viewport to breathe.
