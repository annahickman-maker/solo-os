---
name: brand-taste
description: Use when the user wants to design or build a brand website, marketing site, landing page, portfolio site, studio site, founder/coach site, product brand site, or any web page where brand expression and visual quality are the point. Trigger phrases include "design a brand site", "build a marketing page", "make this look editorial", "give this taste", "design the brand", "make a landing page that doesn't look generic", "I want it to feel premium / editorial / photography-led / not SaaS-y", or any request where the answer needs visual conviction beyond a component library. Also use when critiquing or redesigning an existing brand site for taste. Do NOT use for dashboards, admin UIs, internal tooling, design-system-only work, or backend tasks where brand expression is irrelevant.
version: 1.0.0
---

# brand-taste

Design brand websites with editorial-meets-warm taste: photography-led, conceptually grounded, system-disciplined. Each brand earns its own visual world from a single conceptual seed; nothing is grafted on from a house style.

This skill is not "minimalism." It is restraint in service of an idea. If you cannot name the idea in one sentence, you are not ready to design.

---

## The non-negotiable workflow

Run this in order. Every time. Do not skip steps and do not reorder them.

### 1. Load all references before you write any code

Open and read, in this order:
- `references/methodology.md` (the working method)
- `references/typography.md`
- `references/color.md`
- `references/imagery.md`
- `references/layout.md`
- `references/copy.md`
- At least one file in `references/case-studies/` to ground the abstract rules in a worked example

If you have not read these in this session, do it now. Do not write code or HTML on the strength of the description alone.

### 2. Find the conceptual seed first

Before anything visual, write 1-3 sentences naming the brand's central metaphor or idea. The seed answers: *what is this brand actually about, expressed as one image, object, or feeling?*

Examples of well-formed seeds:
- "A river carving its own path - non-linear healing as continuous forward motion."
- "Frosted glass and condensation - aestheticizing the heat and effort of real work."
- "Play with purpose - sport reframed as cultural ritual, not competition."
- "An indexed closet - what you already own, made findable and lovable again."

Examples of malformed seeds (do not accept these from yourself):
- "Premium and modern" (not a metaphor, just a vibe)
- "Clean and minimal" (describes execution, not idea)
- "Trustworthy and warm" (adjectives, not a seed)
- "For busy women who want healthy skin" (audience, not idea)

If you cannot articulate a seed, stop and ask the user about: the founder's origin story, the strongest piece of customer language, the literal product or place, or the one cultural reference they keep gravitating toward. The seed is usually hiding in one of those four places.

Every downstream decision - typography, color, imagery, layout, copy - must trace back to the seed. If a decision does not trace, cut it.

### 3. Fill out the brand brief, get approval before any code

Use `templates/brand-brief.md`. One page covering:

- **Conceptual seed** (1-3 sentences)
- **Typography**: display + body typeface choices with foundry/Google Fonts links, and one sentence each on why these support the seed
- **Color**: full palette with hex values and usage ratio (e.g. "70% off-white #F4EFE6, 20% deep ink #1A1A1A, 10% rust accent #B5532A"), with one sentence on where the accent comes from in the seed
- **Imagery**: 3-5 specific art-direction prompts ready to feed Midjourney/Flux/Nano Banana, covering subject, lighting, color grade, lens/composition, and what to avoid
- **Layout approach**: grid, vertical rhythm posture, where the design breathes vs. compresses
- **Copy voice**: tagline candidates, eyebrow label samples, body voice description with one example sentence

Show the brief to the user. Get explicit approval. Do not generate HTML/CSS/React until the brief is approved. If the user pushes back on a single element, revise the brief and re-confirm before moving on - do not negotiate piecemeal during implementation.

### 4. Generate image-direction prompts, not placeholders

For every image slot in the design, write a detailed art-direction prompt (subject, action, lighting, lens/grade, composition, aspect ratio, what to avoid). Place each prompt as a comment next to the `<img>` tag in the source. Use a **flat** block of the brief's neutral (or the silver/sage/sand accent at low opacity) as the placeholder, not stock from Unsplash and not lorem-pixel. The user swaps in real assets later.

**Critical**: do not use multi-stop linear/radial gradients to simulate "moody photograph at golden hour." That is itself a drift. A gradient cosplay-of-an-image looks impressive in screenshots and convinces future-you that real photography is no longer urgent, which is the single highest-leverage thing left on the brand. Honest placeholders force the asset conversation.

```html
<!--
IMAGE PROMPT (hero):
35mm film photograph. A woman's hand resting on a sun-warmed stone wall
in rural Tuscany, late afternoon. Soft warm shadow falling across her
forearm. Olive branch in soft focus background. Kodak Portra 400 grade,
warm desaturated greens, golden skin tones. Composition: hand lower-left
third, generous negative space top-right for headline overlay.
Aspect: 5:4. AVOID: glossy retouching, stock-photo feel, posed model
energy, hard digital sharpness, oversaturated greens.
-->
<img src="/images/hero-hand-stone.jpg" alt="" class="hero-image" />
```

### 5. Implement against the brief, not vibes

- Load real fonts via Google Fonts `<link>` or `@font-face`. No system-stack approximations once a face is chosen.
- Use the actual hex values from the brief. Do not introduce a sixth color because "the section needed contrast." Push the contrast through scale or weight instead.
- Spacing comes from a token scale defined in the brief (e.g. 8/16/24/40/64/96/160). Do not freehand magic numbers.
- No typeface, color, or pattern that is not in the brief. If you feel the urge, that is a signal the brief is wrong - go fix the brief, not the implementation.

### 6. Default to restraint

When in doubt: more white space, larger type, fewer accent colors, fewer effects, fewer sections. Editorial impact comes from what is removed, not what is added. A single full-bleed photograph followed by 200px of empty cream is almost always better than three feature cards.

If a section feels weak, the answer is rarely "add a gradient" or "add an icon." It is usually "make the photograph bigger, the headline larger, and delete two of the three sub-points."

### 7. Self-critique before delivering

Run `templates/self-critique.md`. Answer honestly:

1. Does every visual decision trace back to the conceptual seed? Name the trace for the top 5 decisions.
2. Did I introduce any typeface, color, gradient, shadow, or pattern not in the brief?
3. Where would an editorial art director cut, enlarge, or remove?
4. Does the imagery direction read as editorial, or stock-y? Quote the prompt and judge.
5. Is there any moment where I reverted to AI-default design (centered hero + three feature cards, gradient hero, glass cards, sprinkle of accent on every CTA)?

List your honest answers. Fix the top three issues before showing the user. Then show the user the critique alongside the work, so they can see your thinking.

---

## Things this skill is NOT

These are AI-default failure modes. If you catch yourself reaching for any of them, stop:

- **Not glassmorphism, gradient meshes, or SaaS-illustration aesthetics.** No frosted-glass cards, no purple-to-pink hero gradients, no isometric brand illustrations of cheerful figures holding tablets.
- **Not Tailwind-default-everything.** `bg-white`, `text-gray-900`, `rounded-lg`, `shadow-md`, `px-6 py-4` - that combination is the visual fingerprint of "I did not make a single design decision." Define real tokens.
- **Not stock-photo grids and rounded-corner cards.** If the layout is "three cards in a row each with an icon and a heading and two lines of body," you have built a SaaS feature page, not a brand site. Replace with a single editorial spread or a long-form section.
- **Not heavy shadow stacks or animated gradients.** Drop shadows belong on physical product photography, not on UI panels. Animated gradients are a 2021 SaaS tell.
- **Not "sprinkle accent color on every CTA."** Accent should appear 2-4 times on a page maximum. CTAs can be black-on-cream and still convert.
- **Not lorem-ipsum-with-emoji-bullets.** Real copy or no copy. Emoji bullets are an instant taste-killer.
- **Not centered-everything hero with three-feature-grid below.** This is the universal AI design template. Asymmetry, full-bleed, off-grid alignment, oversized type - any of those break the template.
- **Not "let's add motion to make it feel alive."** Motion supports content, not the other way around. A still page with great photography and typography beats a page with `framer-motion` on every block.
- **Not lifestyle stock from Unsplash as a stand-in.** Use a flat colored block placeholder + image-direction comment. Stock seeds the wrong taste.

---

## When to ask the user vs. when to decide

Decide unilaterally:
- Specific hex values within the agreed palette
- Typeface weight choices within the agreed family
- Spacing tokens, grid columns, breakpoint behavior
- Section order within the agreed page structure
- Copy phrasing within the agreed voice

Ask the user:
- The conceptual seed itself, if you cannot extract one with confidence from what they have given you
- Which of two equally-strong typeface directions to pursue (e.g. editorial serif vs. mono-grotesk)
- Whether to lean warm-earthy or cool-clinical when the seed could go either way
- Photography access: do they have brand photography, will they generate it, or should the design hold space for assets-to-come

Default to deciding. Ask only when the answer would change the entire visual direction.

---

## File map

```
brand-taste/
├── SKILL.md                          (this file)
├── references/
│   ├── methodology.md                (concept → system → execution)
│   ├── typography.md                 (type systems, pairings, sourcing)
│   ├── color.md                      (palette logic, per-brand examples)
│   ├── imagery.md                    (art direction + image-gen prompts)
│   ├── layout.md                     (grid, spacing, vertical rhythm)
│   ├── copy.md                       (voice, taglines, section labels)
│   └── case-studies/
│       ├── case-01.md                (wellness brand, river metaphor)
│       ├── case-02.md                (performance beauty, condensation metaphor)
│       └── case-03.md                (sport-as-culture, ritual metaphor)
└── templates/
    ├── brand-brief.md                (one-page brief to fill before code)
    └── self-critique.md              (checklist before delivery)
```

Do not edit references during a build. They are the reference; the brief is the working document.
