# Imagery & art direction

This is the most important section in the skill. The reference work is **photography-led**. The typography and color frame the photography; they are not the lead. If the photography is wrong, the brand is wrong, and no amount of typesetting will save it.

## What "editorial" actually means

Editorial photography is real, slightly imperfect, and selected. It is the opposite of stock. Specifically:

| Editorial | Stock-y (avoid) |
|---|---|
| Real hands, knuckles visible, skin texture intact | Smooth retouched hands, model-ish |
| Light is doing something - falling across, raking, hard noon, golden raking | Light is even and flat to "look professional" |
| The subject is doing something, not looking at the camera | Subject smiling at camera, holding product |
| Negative space wide enough to set type into | Subject centered, no breathing room |
| One frame holds the section | Three frames in a grid because each is too weak alone |
| Color is graded warm and slightly desaturated (or cool and desaturated) | Color is generic-bright "saturated and clean" |
| Imperfections kept: a wisp of hair, a wrinkle, dust on a surface, a smudge of condensation | Everything cleaned and corrected |

## The recurring lighting modes

Pick one per brand. Do not mix.

1. **Soft window light.** Warm afternoon through a sheer curtain, falling across one side of the face/object. Subject has shadow on the back side. Mood: intimate, editorial, magazine-cover.
2. **Hard sun, late afternoon.** High contrast, long shadows. Sometimes flare. Mood: alive, candid, slightly cinematic.
3. **Golden hour, raking light.** Sun nearly horizontal. Skin is warm; landscape is gold. Mood: aspirational without being saccharine.
4. **Bright overcast.** Even, shadow-free, slightly diffused. Mood: clinical-but-warm, neutral, lets the subject lead.
5. **Studio with controlled spill.** Single soft source, fall-off into shadow. Used for product shots and studio portraiture. Mood: deliberate, editorial cover.
6. **Wet / dewy / condensation.** Specifically for products that imply moisture (skincare, beverage, beauty). Mood: tactile, sensory.

If you cannot tell from the brief which mode is right, ask one question: *what time of day does this brand happen?* The answer dictates the lighting.

## Composition patterns

The reference work uses these moves consistently:

- **Negative-space-heavy single frame.** Subject takes 30-50% of the frame. The rest is sky, wall, water, fabric. Type can sit in the negative space without an overlay.
- **Body-cropped close.** Hands, shoulders, jawline, the back of a neck. Faces optional. The crop tells the story.
- **Hands and objects.** A hand resting on a stone, holding the product, picking up an olive. The hand is half the photograph; the object is the other half.
- **Environmental wide.** A wide shot establishing place: a meadow, a kitchen, a workshop, a store interior. Subject small in the frame or absent. Sets context.
- **Paired diptych.** Two photographs side by side, related but not identical. Hand + landscape. Detail + wide. The pair carries more meaning than either alone.
- **Asymmetric pull.** A photograph that breaks the column grid - bleeds left while the text bleeds right. Used sparingly, with intent.
- **Gridded contact-sheet.** A row of 4-6 small images, all in the same lighting and grade, like a film strip. Used for "behind the scenes" or "process" sections, never as the main hero.

## Aspect ratios and how images sit on the page

- **Hero**: full-bleed (`100vw`), height 75-95vh. Single image. Type overlaid in a corner with generous offset, or set below the image entirely.
- **Section image**: 5:4 or 4:3 portrait, 16:10 landscape. Sits inside the grid, often spanning 7-9 of 12 columns with text in the remaining 3-5.
- **Diptych**: two 4:5 portraits side by side, same total width as a single hero would be.
- **Detail / inset**: 1:1 square or 4:5 portrait, smaller (3-5 columns wide).
- **Contact sheet**: row of 5-6 images at the same small ratio, full-bleed row.

Avoid: 16:9 widescreen for portrait subjects (cuts the head awkwardly), 1:1 squares for landscapes (squishes the place).

## Image-prompt template (for AI generation or photographer briefs)

Use this format for every image slot in a brief. It is also the comment format for placeholder `<img>` tags during implementation.

```
SUBJECT: [the literal subject - a hand, a woman walking, a product on stone, a kitchen counter with morning light]
ACTION: [what is happening - resting, walking, pouring, drying, watching]
LIGHTING: [one of the six modes above, with time-of-day specifics]
COLOR GRADE: [warm/cool, desaturated/saturated, film stock reference if useful - "Kodak Portra 400" / "Fuji Pro 400H" / "Cinestill 800T"]
LENS / DEPTH: [50mm shallow / 85mm portrait compression / 35mm wider / wide environmental]
COMPOSITION: [where the subject sits in frame, where negative space lives, where type would go]
ASPECT RATIO: [4:5 / 5:4 / 16:10 / 1:1]
AVOID: [the failure modes - "no glossy retouching, no posed model energy, no oversaturated greens, no stock-photo feel"]
```

### Examples (worked through)

**Wellness brand, river metaphor, hero image:**
```
SUBJECT: A woman's bare feet on river stones at the edge of moving water
ACTION: Standing still, water just past her ankles, slight ripples
LIGHTING: Golden hour, raking light across the water surface
COLOR GRADE: Kodak Portra 400 - warm desaturated greens, golden skin, lifted shadows
LENS / DEPTH: 35mm, shallow focus on feet, water blurring softly behind
COMPOSITION: Feet in lower-right third, water and stones filling lower 60%, soft sky upper 40% for headline space
ASPECT RATIO: 16:10 (full-bleed hero)
AVOID: No clinical brightness, no clean retouching, no full body, no face. Skin texture must remain.
```

**Performance beauty, condensation metaphor, product shot:**
```
SUBJECT: Frosted glass spray bottle resting on a sun-warmed concrete surface
ACTION: Single bead of condensation rolling down the side
LIGHTING: Hard sun late afternoon, long shadow extending right
COLOR GRADE: Slightly cool, neutral whites, deep shadow, true sapphire blue glass
LENS / DEPTH: 50mm, sharp on bottle, shadow soft
COMPOSITION: Bottle center-left, shadow extending into right two-thirds (room for type)
ASPECT RATIO: 5:4
AVOID: No studio sweep background, no soft glamour lighting, no glossy product retouch. Concrete texture visible.
```

**Olive oil brand, Mediterranean-grove metaphor, environmental wide:**
```
SUBJECT: An olive grove on a hillside in late afternoon, three terraces visible
ACTION: Wind moving through the leaves, no people
LIGHTING: Golden hour, sun coming from frame left, long shadows from each tree
COLOR GRADE: Warm desaturated, silver-green olive leaves, dry yellow grass underneath, terracotta soil
LENS / DEPTH: Wide 24mm, deep focus across all terraces
COMPOSITION: Trees fill lower 70%, soft sky upper 30% for type placement
ASPECT RATIO: 16:9 (full-bleed)
AVOID: No tourist stock-photo feel, no oversaturated green, no high-key brightness. Real Italian agricultural land, not idealized.
```

## Where editorial drifts toward stock (and how to catch it)

The slip points are predictable. Watch for:

- **The smile.** A subject smiling at camera reads stock instantly. Editorial subjects look away, look down, are absorbed.
- **The clean.** Surfaces wiped, hair styled, flowers arranged. Editorial leaves a wisp out of place, a smudge on the bottle, a leaf on the table.
- **The center.** Subject centered, room equally on both sides. Editorial offsets the subject, holds asymmetry.
- **The product hero.** Product floating on white background, dramatic shadow under it, "as seen on Amazon." Editorial puts the product in a place, in a hand, on a surface that has its own weight.
- **The diversity-checkbox set.** A row of four people of different ethnicities all smiling at camera. Editorial casts one or two people, deeply, with care - not a panel.

If you catch yourself describing one of these, rewrite the prompt before generating.

## Working with AI image generation

When the user will generate brand photography with Nano Banana, Midjourney, or Flux: the prompt template above is the brief. Always include:

- A **film stock reference** (Kodak Portra 400, Fuji Pro 400H, Cinestill 800T, Ilford HP5 if black-and-white). This single line is the difference between "AI render" and "looks like a photograph."
- An explicit "AVOID" line listing the AI-generic failure modes (oversaturated, glossy, plastic skin, weird hands, dramatic lighting, fantasy aesthetic).
- A specific lens / lens equivalent (35mm, 50mm, 85mm). AI models honor this.
- A real place reference if applicable ("a hillside in Tuscany, not an idealized Mediterranean").

For batch consistency, start every prompt with the same lighting + grade + lens stack, then vary the subject. This gives you a coherent set instead of one-off images that don't sit together.

When working in this skill alongside the user's `nano-banana-integration` and `ai-image-prompting` skills, defer to those for the API mechanics. The art direction in this file is what fills out the prompt body.
