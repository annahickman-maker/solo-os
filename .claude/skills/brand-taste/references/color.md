# Color

The reference work runs on a **70-85% neutral / 15-30% accent** ratio. Pure white is rare; warm neutrals dominate. Saturated color appears once or twice per page, not throughout. Color is sourced from the conceptual seed, not from a generic "brand colors" intuition.

## The neutral foundation

Roughly 70-85% of every page is one of these neutral families. Pick one. Do not mix two.

| Family | Hex range | Mood | Pairs with |
|---|---|---|---|
| Cream / oat | `#F4EFE6`, `#F7F2E9`, `#F8F4EC` | Warm, editorial, patient | Earth tones, deep forest, rust, ink |
| Linen / sand | `#EDE5D8`, `#E8DDD0`, `#E5D9C6` | Sun-warmed, hospitality-leaning | Olive, sage, terracotta, cocoa |
| Off-white / soft | `#F8F7F4`, `#FAFAF8`, `#F5F5F0` | Clean but never clinical | Charcoal, sage, dusty rose, soft sky |
| Warm grey / stone | `#D9D6CF`, `#CFCAC0`, `#BFB9AD` | Architectural, grounded | Black, deep teal, rust |
| Deep ink / charcoal | `#1A1A1A`, `#1F1D1A`, `#222018` | Editorial weight (used as background, not accent) | Cream, sand, single warm accent |

Rules:
- Never `#FFFFFF` for backgrounds. Always warmed slightly. Pure white reads cold and digital and is the single fastest way to make a brand site look like a SaaS template.
- Never `#000000` for body text. Always `#1A1A1A` or warmer (`#1F1D1A`, `#222018`). Pure black on cream is too aggressive.
- Pick one neutral family per brand and stay in it. Don't combine cream with cool grey.

## The accent

The accent is the seed expressed as color. It is one or two values, used in 10-25% of the page total, concentrated in 2-4 placements.

Per-brand examples extracted from the reference work:

### Wellness / river metaphor (a women's healthcare brand)
- 80% off-white `#F4EFE6` + warm cream
- 12% deep charcoal `#1A1A1A` (text)
- 5% sage `#7A9B7F` (logo accent, single section background)
- 3% mustard `#D4A574` (one CTA, one underline)

The mustard is a sun-on-water reference; the sage is grounded earth. Both come from the river-and-meadow seed.

### Performance beauty / condensation metaphor
- 75% warm linen `#E8DDD0` + soft cream
- 12% deep ink `#1A1A1A`
- 8% sapphire blue `#2B5A8E` (the bottle's actual color)
- 5% blush `#E8A8A0` (skin-flush warmth, used for one accent shape)

The blue is the literal product. The blush is what the product is for (skin flushed from sweat). Both trace.

### Sport / play-with-purpose metaphor
- 70% cream `#F5F1ED`
- 15% deep ink `#1A1A1A`
- 10% sky `#4A90E2` (open sky over a course)
- 5% forest `#2D5016` (the green of the course itself)

Both accents are literal: sky and grass.

### Coastal beverage / energy-as-currency metaphor
- 60% white + soft mint
- 25% teal `#2BA9A3` (water and shade)
- 15% sun yellow `#FFD700` (heat and afternoon)

Higher accent ratio because the seed is high-energy. The neutral is barely there; the brand is loud and that is correct for the seed.

### Editorial coach / executive credibility metaphor
- 80% cream `#F5F1ED`
- 12% deep ink `#1A1A1A`
- 6% warm yellow `#F4D35E` (single accent, one moment per page)
- 2% sage `#8B9D6F` (foliage in photography only, not a UI color)

Almost monochrome by design - the editorial restraint is the message.

## How to source the accent

Three legitimate sources:

1. **The literal product.** The bottle is sapphire blue → the accent is sapphire blue. The packaging is mustard → the accent is mustard.
2. **The literal place / metaphor.** River → moss + sun-on-water. Course → sky + grass. Tuscan grove → silver-olive + warm earth.
3. **The cultural reference.** A specific film, magazine, era. "1970s travel posters" → ochre + faded teal. "1950s Italian cookbook" → terracotta + cream + olive.

Never source the accent from:
- "What feels modern" (vague)
- "Color theory says complementary" (formulaic)
- "Competitors are using this so we should do the opposite" (reactive, not generative)
- A trend palette ("Pantone Color of the Year") - dated by the time the site ships

## Where color actually lives on the page

- Backgrounds: 90%+ neutral. The accent rarely backgrounds a section unless the seed demands it (e.g. a single signature section in deep brand color).
- Type: 95%+ deep ink. Accent type is rare and earned (a single underlined word in a hero, a single accent-color eyebrow on the brand-defining section).
- CTAs: deep-ink-on-cream is the default. Accent-color CTAs are fine but should be rare; do not turn every button into an accent-color block.
- Photography color grading: this is where most of the brand color lives. The grade carries the palette, the UI does not need to repeat it.
- Borders, dividers, rules: neutral, low-contrast. A 1px hairline in `rgba(26,26,26,0.12)` is almost always right.

## Contrast and accessibility

Hold WCAG AA at minimum (4.5:1 body text, 3:1 large text). The warm neutrals + deep ink combination almost always passes. Be careful with:
- Sage-on-cream (often fails)
- Mustard-on-cream (often fails)
- Light grey body text (avoid - `#666` on cream is the SaaS-bland tell anyway)

When the brand color does not have enough contrast for type, use it for shapes, backgrounds, and accents - not body. Type stays in deep ink.
