---
name: testimonial-selection
description: 'Pick which testimonials and proof points to surface for which claim. Match each testimonial to the specific objection it addresses. Use when building a sales page, About page, social post, case study, or any place where proof has to do real work. Avoids the "throw a testimonial wall at it" anti-pattern.'
category: Create
hidden: true
---

# Testimonial Selection

A testimonial wall is a marketer's shortcut. It says "we have many happy customers" but not "this objection you have right now is wrong." A single well-placed testimonial that answers a specific doubt does more work than ten generic praise quotes.

## Required vault data

- `proof.md` - case studies, before/afters, specific results, quotes (at root or `01_Core/`)
- `01_Core/core_audience.md` - the reader's known objections, fears, and doubts

If `proof.md` doesn't exist or is empty, the page should use specific numbers (revenue, lead count, dates) instead of testimonials. Never invent.

## The principle

Every testimonial answers a specific doubt. Map doubts to testimonials before placing any.

| Reader doubt | What testimonial type answers it |
|---|---|
| "This won't work for me" | Identity-match testimonial - someone like the reader, with the same starting point |
| "It's too expensive" | ROI testimonial - specific revenue/saved-time numbers |
| "I don't have time" | Time-cost testimonial - "I did this in [short timeframe]" |
| "I've tried things before" | Failure-context testimonial - "I'd tried X, Y, Z and nothing worked, then..." |
| "Sounds too good to be true" | Specific-number testimonial - exact dates, exact dollars, exact outcomes |
| "I'm not technical / experienced enough" | Beginner testimonial - "I had zero background in this" |

## Testimonial quality criteria (ranked)

**Tier 1 - prioritize these.** Specific, number-anchored, outcome-led:
- Full name (or first name + last initial + city)
- Specific number, date, or outcome ("$12K in 60 days", "doubled my lead flow", "3 weeks to my first sale")
- Context (where they started, what they tried before)
- One quotable line

**Tier 2 - use as fallback when Tier 1 isn't available.** Emotionally-led, transformation-focused:
- How the work transformed how they feel about themselves, their business, their life
- Identity shift ("I used to think I wasn't a real designer, now I run my own studio")
- Relief / unburdening ("I finally feel like I'm doing this right")
- Confidence shift ("for the first time, I feel like I know what I'm doing")

These work because they speak to the reader's emotional state, not just outcomes. They're especially powerful in mirror sections and reframe sections where the reader is processing how they feel, not what they want to achieve.

**Reject these (no tier):**
- Generic praise with no specifics ("Amazing! 5 stars!" / "Highly recommend!")
- Anonymous or unattributed ("a happy customer", "J.S.")
- Praise that could apply to literally any product

**The principle:** never invent a testimonial. If `proof.md` doesn't have any Tier 1 or Tier 2 quotes, use the user's own specific numbers as proof instead, or omit the testimonial section.

## When numbers do the work testimonials usually do

The Olly pattern: instead of a testimonial wall, use specific numbers as proof.

Examples:
- "Our worst-performing video of 2025: 7,700 views and 1,342 email subscribers"
- "3,000 subscribers, $1M in revenue last year"
- "Adam's third video: 306,000 views. Doubled his lead flow."

When the user has strong personal numbers, lean on those. Use testimonials sparingly to prove "this works for people like the reader" - your numbers prove "this works."

## Placement rules

| Section | Testimonial role |
|---|---|
| Hero (above fold) | One short identity-match quote - "Someone like me did this" |
| After "Does this sound familiar?" | Failure-context - "I'd tried everything, then..." |
| After the offer is introduced | ROI or specific-number testimonial |
| In the FAQ | Embedded answer to a specific doubt |
| Final CTA | Identity + outcome - "I was scared of X, now I have Y" |

Never place testimonials in clusters of 6+ as a "wall." Two strong testimonials > ten weak ones.

## Writing process

1. List the reader's top 3 doubts/objections (from `core_audience.md`)
2. Read `proof.md`. For each doubt, find the testimonial that best answers it.
3. If no testimonial exists for a doubt, use a specific number from your own results, OR omit that section.
4. Format each placement: one quotable headline + 1-3 sentences of context + name/city
5. Never invent. If a quote doesn't exist, don't write it.

## Common failure modes

- Throwing every testimonial onto the page
- Using praise quotes with no numbers
- Anonymous testimonials that look invented
- Wall-of-logos without context
- Inventing testimonials when proof.md is thin (instead, use real numbers)
