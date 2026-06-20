# content-extractor reference

## carousel.json schema (exact)

```json
{
  "type": "carousel",
  "source_transcript": "string - vault-relative path",
  "source_excerpt_ref": "string - relative path to source-excerpt.md in same folder",
  "slug": "string - kebab-case, max 5 words",
  "created_date": "string - YYYY-MM-DD",
  "hook": "string - the cover slide line, ≤ 8 words",
  "caption": "string - 1-2 sentence hook + optional body + CTA, NO hashtags inline",
  "hashtags": ["#tag1", "#tag2"],
  "slides": [
    {
      "n": 1,
      "role": "hook",
      "headline": "string ≤ 8 words",
      "body": "",
      "visual_note": "string - renderer instruction"
    },
    {
      "n": 2,
      "role": "body",
      "headline": "string ≤ 8 words",
      "body": "string ≤ 30 words",
      "visual_note": "string"
    },
    {
      "n": 8,
      "role": "cta",
      "headline": "string ≤ 8 words",
      "body": "string ≤ 30 words",
      "visual_note": "string"
    }
  ]
}
```

### Validation rules

Before writing the file:

- `type` must be `"carousel"`
- `slides[0].role` must be `"hook"`
- `slides[-1].role` must be `"cta"`
- All middle slides have `role: "body"`
- 6 ≤ slides.length ≤ 10
- Every `headline` is non-empty and word-count ≤ 8 (hyphenated counts as one word)
- Every `body` other than the hook slide is non-empty and word-count ≤ 30
- `slides[].n` is sequential starting at 1
- `hashtags.length` between 8 and 15
- No em dash characters anywhere in any string
- `caption` does not contain `#` (hashtags live in their own array)

If any rule fails, do NOT write the file. Report the failure and fix.

## Slide role taxonomy

- **hook** (slide 1): the headline. Often a contrarian flip, a specific number, or a stop-scrolling line. `body` is empty. `visual_note` describes the visual treatment.
- **body** (slides 2 through N-1): one idea per slide. Headlines build a narrative the reader can follow even if they skip every other slide.
- **cta** (last slide): the offer / next step. Pulled from instagram-context.md main CTA.

## carousel.md preview format

```md
# <hook>

Source: <transcript path>
Slug: <slug>
Created: <date>

---

## Slide 1 - hook
**<headline>**
Visual: <visual_note>

## Slide 2 - body
**<headline>**
<body>
Visual: <visual_note>

## Slide 3 - body
...

## Slide N - cta
**<headline>**
<body>
Visual: <visual_note>

---

## Caption

<caption>

## Hashtags

<#tag1 #tag2 #tag3 ...>
```

## Slug rules

- Kebab-case lowercase
- Max 5 words
- Derived from the hook, not the source transcript filename
- Strip stopwords (the, a, of, to, for, and, but, or) before measuring length
- Examples:
  - Hook "you don't have a niche problem" → slug `niche-problem`
  - Hook "positioning is a one-line test" → slug `positioning-one-line-test`

## Anti-patterns to avoid in slide copy

- Vague openers: "Let's talk about...", "Here's the thing...", "So...".
- Filler transitions between slides ("Now...", "But wait...", "Here's why...").
- Two ideas in one slide. Always split.
- Restating the hook on the CTA slide. The CTA is action, not theme.
- Hashtags inside captions or slides. Hashtags live in their own array only.
- Personal pronouns that don't match the creator's pattern (read core_voice-style.md).
