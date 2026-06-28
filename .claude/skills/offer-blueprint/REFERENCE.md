# Offer Blueprint - reference

The method, the models, and the exact dashboard map. Read the parts you need.

## The offer method (the lens to build through)

The Hormozi value equation is the engine. These principles are how this system uses it - they override generic advice when they conflict:

1. **The offer matters more than the product.** Nine times out of ten, when something is not selling, it is the offer that needs to change, not the product. The offer is the promise; the product is the delivery.
2. **The same thing sold to two different people has different value.** Optimise the positioning and the promise, not the feature list. Specificity raises value: narrow the promise and the person.
3. **Reputation and offer are the two things that matter.** A great offer with no trust does not sell. Lead with proof of the result, not a clever sales page.
4. **Create 10x the value you charge.** If the price is $1,000, the buyer should be able to get at least $10,000 of value or results within a year. Raise price by stacking proof and moving the value-equation levers, not by bolting on more features.
5. **Show the price.** The number is positioning - it repels the wrong people and confirms the right ones. Hidden prices scare off the right-fit buyers and attract the lowest-expectation ones.
6. **Proof beats volume.** One testimonial from someone exactly like the avatar, in their exact situation, outweighs a wall of generic ones.
7. **Content is a value lever.** A tutorial or walkthrough that shows the mechanism does most of the selling before the sales page. Treat content as part of the offer, not separate from it.
8. **Validate before you build.** If you cannot attract people who want the result, the product is useless. Sell the promise (a micro offer / MVP / beta) and learn from real feedback before perfecting.
9. **Delivery by leverage, not preference.** Match format to distribution: ~100 visitors -> a 1:1 offer ($5k+); ~1,000 -> 1:few ($500+); thousands -> 1:many ($50-200). A different format can raise perceived value.
10. **Only real urgency.** A price that rises as proof/members grow, genuine capacity limits, a true beta window. No countdown timers, no fake scarcity, no "easy" or "passive income" or guru language.

## The 5 levels of awareness (pitch to where the avatar actually is)

1. **Unaware** - does not know they have the problem. Lead with a story or a pattern they recognise; name the problem for them.
2. **Problem-aware** - feels the pain, does not know solutions exist. Agitate the pain, then reveal that a path exists.
3. **Solution-aware** - knows solutions exist, not yours. Differentiate the category and your mechanism.
4. **Product-aware** - knows your thing, not sure it is right for them. Lead with proof, risk reversal, and specifics.
5. **Most-aware** - ready, needs the deal. Lead with the offer, the price, and the reason to act now (real urgency only).

Every blueprint component must match the avatar's level. A problem-aware audience needs the Big Problem framed sharply; a most-aware one needs the Quantifiable Outcome and Risk Reversal up front.

## Blueprint component specs

- **Delivery Mechanism** - the format that maximises perceived value for this audience and distribution (see principle 9).
- **Big Idea** - one concise, attention-grabbing hook. The transformation, not the activity.
- **Big Problem** - the primary pain, framed for the awareness level.
- **Irking Pain Points** - a progressive list, each more specific and emotionally sharper than the last, all stemming from the Big Problem. Pull the avatar's own words from their file.
- **Quantifiable Outcome** - a specific, measurable result with a timeframe ("get 10 paying members in 30 days"). Believable, never inflated.
- **Risk Reversal** - a creative guarantee beyond plain money-back (a result guarantee, a do-it-with-you redo, a keep-the-bonuses clause).
- **Unique Mechanism** - the proprietary system, named, in 3-5 steps. This is the "why this works when other things did not."
- **Features & Benefits** - each feature paired with why it matters to the reader (`feature: the benefit`).
- **Value Equation Analysis** - how the offer maximises (Dream Outcome x Perceived Likelihood) / (Time Delay x Effort & Sacrifice). Name the lever each blueprint choice pulls.
- **Positioning Recommendations** - how to communicate the offer across channels, matched to awareness level.

## Dashboard field map + write recipe

The offer section is backed by `00_System/state.md` slots and `offer-pricing-rungs.json`. Write through the dashboard offer API (the dashboard server, local port - `8790` on the Solo OS stack - with `?pw=dev`). Read the offer first with `GET /api/offers?pw=dev` to get rung ids and current values.

| Blueprint piece | Dashboard field | How to write it |
|---|---|---|
| Big Idea + Quantifiable Outcome (one line) | offer big promise | `PATCH /api/offers/slots` body `{"slot":"big_promise","value":"..."}` |
| Quantifiable Outcome (the transformation) | transformation | `{"slot":"transformation","value":"..."}` on `/slots` |
| Unique Mechanism (named) | mechanism | `{"slot":"mechanism","value":"..."}` on `/slots` |
| Target Audience / who it is for | who | `{"slot":"who","value":"..."}` on `/slots` |
| Offer name | name | `{"slot":"name","value":"..."}` on `/slots` |
| The promise on a specific rung | that rung's promise | `PATCH /api/offers/pricing-rungs/<rungId>/slots` body `{"slot":"promise_text","value":"..."}` |
| Validation stage | offer stage | `PATCH /api/offers/stage` body `{"stage":"idea|validated|iterating|signature|scaling"}` |

Curl shape: `curl -s -X PATCH -H "content-type: application/json" "http://localhost:8790/api/offers/slots?pw=dev" -d '{"slot":"big_promise","value":"..."}'` -> `{"ok":true}`.

**OFFERCHECK (the 5 strength levers)** - do NOT auto-write these (endpoint `PATCH /api/offers/ratings {"slot":"<lever>_q<n>","score":1-5}`). They are the user's honest self-assessment. Instead, read them out and coach: for each lever, say where the blueprint makes them strong, where it is weak, and the fix. Levers and their questions:
- **clarity** - is the offer instantly understood, specific, focused, for an obvious person.
- **proof** - have they got the result, do they publish it, is it specific to this avatar.
- **avatar** - could they describe the before-state and dream outcome in vivid detail; have they talked to 10 real ones.
- **effort** - is the path 3-5 simple steps, objections handled, a no-brainer tradeoff.
- **time** - quick win on day one, a clear timeline, examples of others getting there fast.

**Validation stages** (recommend the one their real proof supports, name the next check to tick):
idea (drafted, no paid customers) -> validated (1-5 paid from a real launch) -> iterating (launch cycles every 6-8 weeks, price rising) -> signature (named, streamlined, premium-priced) -> scaling (suite + email systems + inbound).

**Attaching the avatar:** the offer's "who" should reflect the chosen avatar. Set the `who` slot from the avatar's identity, and if refining a specific rung that supports an attached avatar, keep that link intact.
