---
name: design-critique
description: Senior designer critique framework for reviewing web design, strategy decks, copy layouts, and any visual work. Use when evaluating or reviewing designs, diagnosing "this feels off", providing design feedback, or improving an existing layout. Covers hierarchy analysis, common mistakes, how to articulate fixes, and specific checklists for evaluating typography, layout, colour, and imagery.
---

# Design Critique

A senior designer looks at a layout and knows instantly whether it works. A junior designer looks at the same layout and knows something is off but can't articulate why. This skill closes that gap.

Use this when:
- Reviewing a design (yours or a client's)
- Diagnosing "this doesn't feel right"
- Providing specific, actionable feedback
- Deciding what to fix first when something feels weak

---

## Core principle

Good critique is specific. "This looks cheap" is useless feedback. "The body copy is too close to the heading, the type scale has no contrast, and the CTA colour is fighting the brand primary" is actionable.

This skill gives you the vocabulary to move from "it feels off" to "here's exactly what to change."

---

## The 30-second diagnostic

When looking at any design for the first time, run through these questions in order:

### 1. Can I tell what the primary action is within 2 seconds?
If no, hierarchy is weak. The most important element should jump out immediately.

### 2. Where does my eye go first? Second? Third?
Trace the viewing path. If it's chaotic or boring, the visual hierarchy needs work.

### 3. What am I meant to read?
If the type is too dense, too small, or too uniform, the reader has to work too hard.

### 4. What's the primary emotion this evokes?
Should match the brand. If it doesn't, something fundamental is off (usually colour or photography).

### 5. Does it feel balanced or lopsided?
Balance doesn't mean symmetry - it means visual weight is intentionally distributed.

### 6. Does everything belong together?
If one element looks like it came from a different design, there's a consistency problem.

After this 30-second scan, you'll know which of the next sections to dig into.

---

## Typography critique

### What to check

- **Hierarchy** - Can you identify primary, secondary, tertiary text at a glance?
- **Type scale** - Are the size jumps clean and intentional?
- **Line height** - Does the text feel cramped or spaced out correctly?
- **Line length** - Is body text 45-75 characters per line (not full-width)?
- **Font choice** - Do the fonts fit the brand? Not too many families?
- **Weight contrast** - Is there enough difference between headings and body?
- **Letter spacing** - Are uppercase labels tracked wider? Large display tracked tighter?

### Common failures

**"Type looks flat"**
- Usually means there's not enough size contrast between levels
- Fix: increase the type scale (go from 1.25 ratio to 1.333 or higher)

**"Text is cramped"**
- Usually line-height is too tight on body (<1.5) or too loose on display (>1.2)
- Fix: adjust line-height based on size

**"Headings feel weak"**
- Usually they're not big enough or not visually separated from body
- Fix: increase size, add whitespace above, consider italic for emphasis

**"Body text is hard to read"**
- Too small (<13px), too wide (>75ch), line-height too tight, or low contrast
- Fix: check all four

**"The fonts don't match the vibe"**
- Serif should signal tradition/editorial, sans should signal modern/clean
- Fix: swap to a more appropriate family, or commit to the current direction

---

## Layout critique

### What to check

- **Grid** - Does everything sit on an invisible grid or does stuff float randomly?
- **Spacing** - Does spacing follow a scale (4/8/16/24/32/...) or random values?
- **Alignment** - Are elements consistently left/center/right aligned?
- **Balance** - Is visual weight distributed intentionally?
- **Whitespace** - Is empty space intentional or accidental?
- **Section breaks** - Are sections clearly separated or do they run together?
- **Flow** - Does the eye move through the design logically?

### Common failures

**"It looks crowded"**
- Not enough whitespace between elements
- Too much content trying to fit
- Fix: remove content, increase padding, simplify

**"It looks empty"**
- Whitespace without purpose
- Elements too small for the space they're in
- Fix: scale up hero elements, add supporting content, tighten the layout

**"Nothing feels important"**
- Weak hierarchy, no focal point
- Everything is the same visual weight
- Fix: make ONE thing much bigger/bolder/more prominent

**"It looks messy"**
- Inconsistent spacing (some gaps 12px, others 17px, others 23px)
- Things not aligning to a grid
- Fix: commit to a spacing scale, realign everything

**"It doesn't flow"**
- No clear viewing path
- Important elements in the wrong positions
- Fix: put primary content in the top-left or center, supporting content around it

---

## Colour critique

### What to check

- **Palette count** - 3-5 meaningful colours, no more
- **Contrast** - WCAG AA minimum for all text (4.5:1 normal, 3:1 large)
- **Brand alignment** - Do the colours reinforce the brand mood?
- **Neutrals** - Are they off-white/off-black or harsh pure colours?
- **Proportion** - Is the 60/30/10 rule roughly followed?
- **Primary prominence** - Is the primary colour used for the RIGHT things (CTAs, key highlights)?

### Common failures

**"It looks generic"**
- Probably using startup blue (#4285F4) or generic neutrals
- Fix: commit to an unexpected primary colour, use warm off-whites

**"It feels cheap"**
- Pure #FFFFFF backgrounds, pure #000000 text, or oversaturated accents
- Fix: soften to off-white, off-black, desaturate accents

**"The CTA doesn't pop"**
- Primary colour is used too much elsewhere, diluting its power
- Fix: reduce primary colour usage to 10% of the design, reserve for CTAs

**"Hard to read"**
- Low contrast (grey text on light grey background, or coloured text on coloured background)
- Fix: run contrast checker, meet at least AA

**"Palette feels random"**
- Colours don't have a consistent hue relationship
- Fix: generate palette in HSL, keep hue consistent or use intentional harmonies

---

## Imagery critique

### What to check

- **Style consistency** - Do all images feel like they belong to the same brand?
- **Quality** - Do they look like real photography, not stock/AI artifacts?
- **Framing** - Are they well-composed, or awkwardly cropped?
- **Mood match** - Does the imagery mood match the brand?
- **Resolution** - Are they sharp or pixelated?
- **Colour grading** - Do they share a consistent treatment?

### Common failures

**"The photos look stock"**
- Generic smiling people, clichéd poses, over-lit, overly-branded
- Fix: use more candid, cinematic, editorial-style imagery

**"Images don't match"**
- Different colour grading, different styles, different lighting
- Fix: apply consistent treatment, or pick from a cohesive source

**"Hero image is weak"**
- Too busy, wrong focal point, doesn't support the headline
- Fix: pick imagery with clear negative space for text overlay, simpler composition

**"Images feel tacked on"**
- Images don't relate to the content around them
- Fix: pick imagery that reinforces the specific message of each section

---

## Specific design patterns and when they break

### The "everything centered" failure
When every element is center-aligned, nothing feels important. Mix alignments - left-aligned body for readability, occasional center-aligned callouts for emphasis.

### The "rainbow palette" failure
Using 7+ colours because each seemed nice individually. Cut back to 3-5.

### The "placeholder content" failure
Designing with "Lorem Ipsum" then realising real content doesn't fit. Always design with real content.

### The "desktop only" failure
Looks great at 1440px, falls apart at 375px mobile. Always test at multiple widths.

### The "no state" failure
Designs show only the happy path. No hover states, error states, empty states, loading states. Consider all states.

### The "CTA competing with itself" failure
Multiple CTAs on the same page, all fighting for attention. Pick ONE primary, make others secondary.

### The "hierarchy inversion" failure
Secondary information is more visually prominent than primary. The headline should be bigger than the caption underneath.

---

## How to articulate feedback

Don't say: "This feels off."
Say: "The hero headline is getting lost because it's only 20% larger than the body copy. Also the primary colour is being used in 5 places, so when I get to the CTA, my eye doesn't know where to land."

### Structure for feedback

1. **State the observation** (what you see)
2. **Explain the impact** (why it matters)
3. **Suggest the fix** (what to change)

**Example:**
- Observation: "The CTA button is the same width as the paragraph above it."
- Impact: "This makes it look like a continuation of the paragraph rather than an action."
- Fix: "Make the button narrower (auto-width with padding) or significantly wider (full-bleed) to distinguish it."

---

## Squint test

One of the best critique techniques: squint your eyes until the design blurs. Now ask:

- Can I still see the primary element? (hierarchy test)
- Do I see balanced visual blocks? (balance test)
- Is the flow obvious? (composition test)
- Do colours feel harmonious or clashing? (palette test)

If the design still works when blurry, the fundamentals are solid. If it falls apart, the hierarchy/balance/composition needs work.

---

## First impression test

The first 2 seconds of looking at a design matter more than anything else. Close the design, then glance at it for 2 seconds. Without thinking, answer:

- What's this about?
- What do I do next?
- How does it make me feel?

If you can't answer those, the design isn't working at the first-impression level regardless of craft quality.

---

## Applying critique to web design work

When reviewing your own work or a client's design:

### Pass 1: The 30-second diagnostic
Run through the six questions above. Note which area needs work.

### Pass 2: Deep dive on the weak area
If typography is weak, run the typography checklist. If layout is weak, run the layout checklist. Don't try to fix everything at once.

### Pass 3: Articulate the top 3 changes
Don't list 20 issues. Pick the 3 that will have the biggest impact. Describe each with observation + impact + fix.

### Pass 4: Verify improvement
After changes, run the 30-second diagnostic again. If the answers to the 6 questions are now clear and confident, the critique was successful.

---

## The critique hierarchy

When multiple things are wrong, fix them in this order:

1. **Hierarchy** - Without clear hierarchy, nothing else matters
2. **Layout / balance** - The skeleton must be right
3. **Typography** - The content must be readable
4. **Colour** - Supports mood and emphasis
5. **Imagery** - Final layer of polish
6. **Micro-details** - Spacing, alignment, kerning

Don't fix colour before hierarchy. Don't polish details before the layout works.

---

## Questions to ask when stuck

When you can't figure out what's wrong with a design:

- If I removed half the elements, which half would I keep?
- What's the one thing I want the viewer to do?
- Does the design answer the viewer's question in 5 seconds or less?
- Is there a reason for every element to be here?
- Am I following trends or principles? (Principles outlast trends.)
- What would a senior designer critique first?

Often the answer to one of these questions unlocks the critique.
