# Brand brief - [BRAND NAME]

Fill this in completely before writing a single line of HTML. Show it to the user. Get explicit approval. If they push back on a single element, fix the brief and re-confirm before moving on.

If a section is empty or vague, the brief is not done.

---

## 1. Conceptual seed

> [1-3 sentences naming the central metaphor or idea. Not adjectives. Not audience. The metaphor itself.]

**Trace test**: list three downstream visual decisions you can already see flowing from this seed (a color, an image, a typeface direction). If you cannot name three, the seed is too fuzzy. Go back.

1.
2.
3.

---

## 2. Typography

| Role | Typeface | Source / link | Why this for the seed |
|---|---|---|---|
| Display | | | |
| Body | | | |
| Accent (optional) | | | |

**Type scale** (rem):
```
--type-eyebrow:
--type-body-sm:
--type-body:
--type-body-lg:
--type-h3:
--type-h2:
--type-h1: clamp(_, _vw, _)
```

**Tracking specifics**:
- Display: ____
- Body: 0
- Eyebrows (all caps): +____em

**Archetype** (pick one, from `references/typography.md`):
- [ ] Editorial serif + clean modern sans
- [ ] Sharp grotesk + soft serif accent
- [ ] Custom wordmark + neutral sans system
- [ ] Mono + serif (use only with clear editorial-archival seed)

---

## 3. Color

| Role | Hex | % of page | Why (trace to seed) |
|---|---|---|---|
| Neutral background | | _% | |
| Ink (text + structure) | | _% | |
| Primary accent | | _% | |
| Secondary accent (if used) | | _% | |

**Total accent ratio (combined)**: ___% - should be 15-30%, not more.

**Family commitment**:
- [ ] Cream / oat
- [ ] Linen / sand
- [ ] Off-white / soft
- [ ] Warm grey / stone
- [ ] Deep ink (background)

**Rejected color sources** (so you don't drift back):
- Not from a generic "modern + premium" palette
- Not from competitors-and-do-the-opposite
- Not from a current trend palette

**Source of accent**: [Literal product? Literal place / metaphor? Cultural reference?]

---

## 4. Imagery direction

**Lighting mode** (pick one primary; pick a second only if the seed has two registers):
- [ ] Soft window light
- [ ] Hard sun, late afternoon
- [ ] Golden hour, raking light
- [ ] Bright overcast
- [ ] Studio with controlled spill
- [ ] Wet / dewy / condensation

**Color grade** (film stock reference if useful): __________________

**Subject library** (the recurring subjects across the brand):
1.
2.
3.
4.

**Composition rules**:
- Default crop:
- Default subject placement:
- Where negative space lives:
- Where type lays into the image:

### Image-direction prompts (3-5 ready to feed Midjourney/Flux/Nano Banana)

**Prompt 1 - Hero**:
```
SUBJECT:
ACTION:
LIGHTING:
COLOR GRADE:
LENS / DEPTH:
COMPOSITION:
ASPECT RATIO:
AVOID:
```

**Prompt 2 - Section image (e.g. process / origin)**:
```
SUBJECT:
ACTION:
LIGHTING:
COLOR GRADE:
LENS / DEPTH:
COMPOSITION:
ASPECT RATIO:
AVOID:
```

**Prompt 3 - Detail / product shot**:
```
SUBJECT:
ACTION:
LIGHTING:
COLOR GRADE:
LENS / DEPTH:
COMPOSITION:
ASPECT RATIO:
AVOID:
```

**Prompt 4 - Optional**:
```
[as above]
```

**Prompt 5 - Optional**:
```
[as above]
```

---

## 5. Layout approach

**Container max-width**: __________
**Outer page padding**: clamp(__px, __vw, __px)
**Grid**: 12-column / 6-column / other: __________
**Gutter**: __px desktop / __px mobile

**Spacing scale** (rem or px):
```
--space-1:
--space-2:
--space-3:
--space-4:
--space-5:
--space-6:
--space-7:
--space-8:
```

**Default between major sections**: --space-_  (target 96-160px on desktop)

**Page architecture** (pick from the section vocabulary in `references/layout.md`; do not invent new types):

1. Hero (type: A - full-bleed)
2. ____
3. ____
4. ____
5. ____
6. CTA + footer

**Grid breaks** (deliberate moves): 0-2 per page maximum.

---

## 6. Copy voice

**Tagline candidates** (3 options, pick one to lead with):
1.
2.
3.

→ Leading with: __________

**Voice description in one sentence**:
__________

**Sample body paragraph (60-80 words, in the proposed voice)**:

> 

**Eyebrow / section labels**:
- ____
- ____
- ____
- ____

**CTA copy** (verb-first, specific):
- Primary CTA: __________
- Secondary CTA (if any): __________

---

## 7. Approval gate

Before writing any HTML/CSS/React, the user must confirm:

- [ ] Conceptual seed approved
- [ ] Typography approved
- [ ] Color palette + ratio approved
- [ ] Image direction prompts approved (or user has specified they will deliver assets)
- [ ] Layout architecture approved
- [ ] Tagline + voice approved

If any of the above is not yet a yes, do not write code. Revise the brief.
