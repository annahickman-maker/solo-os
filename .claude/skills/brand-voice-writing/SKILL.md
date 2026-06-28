---
name: brand-voice-writing
description: Writing in a specific brand voice consistently across all content types. Use when generating website copy, email templates, proposals, blog posts, social content, or any written deliverable that needs to sound like a specific person or brand. Covers extracting voice from samples, maintaining consistency across content types, voice drift prevention, and the specific voice-matching pattern used in Web Design OS where core_voice-style.md is the source of truth.
category: Create
hidden: true
---

# Brand Voice Writing

Generating content in a specific voice is the hardest thing AI does well. Default AI output has a generic tone - polished, balanced, slightly corporate. Real brands don't sound like that. They sound like a specific person making specific choices.

This skill ensures every piece of generated content sounds like the user, not like AI.

---

## Core principle

Before generating ANY content - copy, emails, proposals, captions, headlines - read `01_Core/core_voice-style.md` first. Every. Single. Time.

The voice file isn't optional background context. It's the calibration reference. Content generated without reading it will drift toward generic AI tone within 2-3 sentences.

---

## What voice actually is

Voice is NOT:
- Tone (tone shifts, voice is constant)
- Formality level
- Vocabulary
- Grammar rules

Voice IS:
- Sentence rhythm (how long/short)
- Word choice patterns (their go-to words)
- Sentence openers (how they start thoughts)
- Transitions (how they move between ideas)
- The rules they break
- The metaphors they reach for
- What they'd never say
- How they'd describe their work to a friend at dinner

Think of it this way: a writer could shift their tone from excited to subdued while still sounding unmistakably like themselves. Voice is what stays constant.

---

## Extracting voice from `core_voice-style.md`

Every Web Design OS user has a core voice file created during onboarding. It contains:

1. **Tone of voice positions** (7 spectrums: Formal/Friendly, Serious/Playful, etc.)
2. **Signature phrases** (specific phrases they use often)
3. **Words and phrases to avoid** (things that make them cringe)
4. **Sentence style** (short, long, mix)
5. **Formatting preferences** (exclamation marks, emojis, etc.)
6. **Voice samples** (2-3 pieces of their real writing)
7. **Voice analysis** (patterns, rhythm, opening style, relationship with reader)

### How to use this when generating content

**Step 1: Read the voice file in full.** Not a summary - the whole thing.

**Step 2: Mentally model the writer.** Before writing a single word, imagine: if this person were saying this out loud, what would they start with? What rhythm would they use?

**Step 3: Use their signature phrases where natural.** Not forced. Where the phrase genuinely fits.

**Step 4: Avoid their avoid-list.** Hard-ban those words.

**Step 5: Match their sentence rhythm.** If they write short punchy sentences, generate short punchy sentences. If they write long flowing ones, match that.

**Step 6: Mirror their openings.** If they tend to start with "Here's the thing..." or "So..." or "Let me explain...", use those patterns.

**Step 7: Read aloud before finalizing.** Read the generated content aloud. Does it sound like the samples? If not, revise.

---

## The voice drift problem

AI-generated content starts in a specific voice then drifts toward generic AI tone after a few paragraphs. The drift is subtle - each sentence is slightly more AI, until by the end the content sounds like default ChatGPT.

### Why it happens

As Claude generates more content, it weighs the earlier generated content as context. If there's more AI-toned content than brand-voiced content in the context, the next sentence tilts toward AI.

### How to prevent it

**1. Reference the voice samples every few paragraphs.**
For long-form content (sales pages, blog posts), re-read the voice samples after every 500 words generated. Realign.

**2. Use specific signature phrases throughout.**
Don't front-load them all in the first paragraph. Distribute them. This creates touchpoints that anchor the voice.

**3. Vary sentence length aggressively.**
AI default is medium-length sentences. Real writers vary - 3-word sentences next to 30-word ones. Match the user's actual rhythm.

**4. Break grammar rules intentionally.**
If the user's samples use sentence fragments, incomplete sentences, or starts with "And" or "But", do the same. AI defaults to complete sentences.

**5. Use direct address.**
"You" makes writing feel like a conversation. Most brand voices lean on "you" heavily. Generic AI overuses "we" and abstract third person.

---

## Content-type specific rules

Different content types need different treatment even in the same voice.

### Website copy (homepage, services, sales)

- Short punchy sentences
- Lots of direct "you" address
- Headlines should sound like the person talking, not marketing headlines
- Benefit-focused, never feature-focused
- CTAs should sound natural ("grab the guide" not "download now")

**Voice check:** Could the user say this out loud without cringing?

### Emails

- Natural openings (not "I hope this email finds you well")
- Specific references to shared context with the client
- Conversational rhythm
- Warmer than website copy
- Can break grammar rules more freely

**Voice check:** Would a real person write this, or is it obviously a template?

### Proposals

- Slightly more formal than emails but still in voice
- Confident without being salesy
- Specific about what's included and what's not
- Benefits-first, then logistics
- Warm close

**Voice check:** Does this feel personal to this specific client?

### Sales pages (long-form)

- Conversational throughout - no pitch voice
- Story-driven when possible
- Vary rhythm dramatically
- Moments of emphasis with short sentences
- Lists and bullets for breathing room
- Multiple CTAs but each feels natural

**Voice check:** After reading, does it feel like a person explaining something or a marketer pitching something?

### Blog posts / articles

- Author voice throughout (first person if that matches the user's style)
- Structure based on how they'd actually explain the topic
- Personal anecdotes if the voice supports them
- Avoid "listicle" format unless that's their style

**Voice check:** Is there a recognizable author voice, or does it sound like a generic content mill article?

### Social captions

- Very short
- Heavy on voice
- Often break grammar intentionally
- Match the platform's convention within the user's voice

**Voice check:** Could someone identify the author without seeing the name?

---

## Voice matching patterns

### Pattern 1: The signature opener
Some writers have distinctive ways of starting things.
- "Here's the thing..."
- "So..."
- "Okay, real talk..."
- "The honest truth is..."
- "Let me tell you what I mean."

Use these when natural, not forced.

### Pattern 2: The conversational aside
Writers often break the main point with a quick aside.
- "And yes, I know this sounds obvious, but..."
- "(Stay with me.)"
- "This is the part most people miss."
- "Pay attention to this bit."

These add personality and humanity.

### Pattern 3: The punchy ending
Strong writers end paragraphs with short, declarative sentences that land.

"Most people think this needs to be complicated. It doesn't."

"The system does the work. You stay in your lane."

"It really is that simple."

### Pattern 4: The specific number
Instead of "a lot" or "many," use specific numbers.
- "Not 80 pages. 6."
- "3 questions. That's it."
- "In 48 hours you'll have the first draft."

Specificity feels honest and confident.

### Pattern 5: The unexpected word
Writers with strong voices use specific words that surprise.
- Instead of "great" → "gorgeous", "brilliant", "unhinged"
- Instead of "good" → "solid", "clean", "smart"
- Instead of "bad" → "clunky", "messy", "bloated"

The user's voice file should list these specific word preferences.

---

## Anti-patterns (avoid these)

### Corporate-speak (unless the user is genuinely formal)
- "Leveraging synergies"
- "Best-in-class solutions"
- "Robust framework"
- "Seamlessly integrates"

### Generic marketing phrases
- "Take your business to the next level"
- "Unleash your potential"
- "Transform your workflow"
- "Revolutionize your approach"

### AI tells
- "In today's fast-paced world..."
- "It's important to note that..."
- "Furthermore..."
- "Ultimately..."
- Starting every paragraph with a topic sentence (too structured)
- Perfectly balanced bullet lists (real writing is messier)

### Hedging (unless the user naturally hedges)
- "This might be helpful..."
- "It could be that..."
- "Some people find..."
- "In some cases..."

Remove hedges unless the user is genuinely tentative. Most brand voices are confident.

---

## Voice consistency checks

Before finalizing any generated content, verify:

- [ ] Read `core_voice-style.md` before starting
- [ ] At least 2 signature phrases used naturally
- [ ] Zero words from the avoid list
- [ ] Sentence rhythm matches their samples (not just medium AI length)
- [ ] Direct address ("you") if that matches their style
- [ ] Read aloud - does it sound like them?
- [ ] Could the user send this without edits, or would they change things?

If the answer to the last question is "they'd change things," the voice isn't matching yet. Revise.

---

## When the user provides feedback on voice

Sometimes the user will say "this doesn't sound like me." Don't defend the generation - diagnose.

### Common feedback and fixes

**"Too formal"**
- Use more contractions (don't, can't, we'll)
- Shorter sentences
- Start sentences with "And", "But", "So"
- Use colloquial phrases

**"Too casual"**
- Remove slang
- Complete sentences
- More structured flow
- Remove exclamation marks

**"Sounds like AI"**
- Add signature phrases
- Vary sentence length dramatically
- Use specific numbers/details
- Break at least one grammar rule intentionally
- Remove topic sentences that front-load the point

**"Not confident enough"**
- Remove hedges ("might", "could", "perhaps")
- Use declarative statements
- Shorter, punchier sentences
- Remove justifications

**"Too salesy"**
- Remove benefit-stacking lists
- Make it conversational
- Remove hype words
- Sound like a person explaining, not a marketer pitching

---

## The read-aloud test

After generating any significant content, mentally read it aloud in the user's voice (based on their samples). If any sentence trips you up, feels wrong, or wouldn't be something they'd actually say, revise.

This test catches more voice issues than any other technique.

---

## Summary

1. Always read `core_voice-style.md` first
2. Use signature phrases; avoid the avoid-list
3. Match sentence rhythm from samples
4. Vary length aggressively
5. Prevent drift by re-anchoring every 500 words on long content
6. Read aloud before finalizing
7. When in doubt, make it more conversational and more specific
