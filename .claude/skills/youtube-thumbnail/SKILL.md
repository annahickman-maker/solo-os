---
name: youtube-thumbnail
description: Generate visual YouTube thumbnails using nano banana (Google Gemini 2.5 Flash Image). Combines universal thumbnail design principles, the user's personal brand visual layer (face references, brand colors, fonts, recurring elements), and the user's thumbnail style references to produce 3-5 thumbnail options for a finalised title and one or more thumbnail phrases. Generates the visual base via the API; text overlay can be applied via ImageMagick or handed off to the user. Use whenever the user asks to generate, design, or create YouTube thumbnails.
---

# YouTube Thumbnail

Generates visual YouTube thumbnails using nano banana. Combines two layers:

1. **Universal layer** (bundled in this skill) - design principles + nano banana prompting patterns
2. **Personal layer** (user vault) - face references, brand colors, fonts, style preferences

The skill won't produce on-brand output without the personal layer populated. If it's missing, the soft setup gate triggers /youtube-setup-thumbnail-brand first.

---

## Preflight

1. Your foundation comes from Solo OS onboarding (the `01_Core/` files). If your core files aren't set up yet, stop and say: run /solopreneur-onboarding first.
2. Read the bundled universal layer (relative paths from this skill folder):
   - `design-principles.md` - what makes a thumbnail click
   - `prompting-patterns.md` - nano banana technical patterns + thumbnail prompt structure
3. Read `00_System/system_config.md` to get the Gemini API key. If missing or has no key, soft setup gate triggers (below).

---

## Soft setup gate - personal brand layer

Check whether all three exist:

1. `01_Core/core_brand-visuals.md` (face refs, brand colors, fonts, recurring elements, mood)
2. `04_YouTube/thumbnail-style.md` (past thumbnails, layout preferences, anti-patterns)
3. `00_System/system_config.md` containing a `GEMINI_API_KEY`

If ANY are missing, STOP and tell the user:

> "Thumbnail generation needs your personal brand layer + nano banana API set up before it can produce on-brand thumbnails.
>
> Without these, the skill can only produce generic thumbnails - they won't have your face, your brand colors, your fonts, or your visual style.
>
> Want to run /youtube-setup-thumbnail-brand (one-time, ~15 minutes) to populate everything, or proceed without it?"

Wait for the user's choice. Never auto-pick.

If they proceed without:
- Use a placeholder portrait description in prompts
- Use generic high-contrast brand-agnostic colors
- Document this so the user knows the output is a stylistic placeholder

---

## Required inputs

Confirm before generating. If missing, ask.

- The finalised video title (must be locked - if not, point user to /youtube-title)
- 1-5 thumbnail phrases to use (default: pull the 5 from the title generator output. User can also specify)
- Brief on what the video covers (transformation, key message, mood) - so the visual fits the content
- Any concrete proof points, numbers, or visual elements the thumbnail should reference

If thumbnail phrases haven't been generated yet, point user to /youtube-title (which produces 5 thumbnail phrase options alongside titles).

---

## Generation flow

### Step 1 - Read the personal layer

Read in this order:
1. `01_Core/core_brand-visuals.md` - extract face reference paths, brand color hexes, fonts, recurring elements, mood descriptors
2. `04_YouTube/thumbnail-style.md` - extract past thumbnails (paths), aspirational references, default composition, text styling, anti-patterns

These inform every prompt.

### Step 2 - Pick the phrases to generate for

If the user said "generate all 5 phrases," loop through all 5.
If they specified a subset, use that.
If they specified zero/just want a generic visual, ask: "Which thumbnail phrase from the title generator output should I prototype first?"

### Step 3 - Build the prompt for each phrase

Use the prompt structure from `prompting-patterns.md`. For each phrase:

1. Pick the **gap type** (desirable result / haven't seen this) - this drives the visual concept
2. Pick the **composition** - face-forward / object-led / metaphor (use `thumbnail-style.md` default if specified)
3. Pick the **emotion** - if face-forward, what specific emotion fits the phrase ("frustrated disbelief" for "wake up", "determined fury" for "adapt or die")
4. Pull **brand specifics** from `core_brand-visuals.md` - colors, lighting style, mood
5. Specify **negative space** - which third of the frame is reserved for text overlay
6. Specify **16:9 YouTube thumbnail** aspect ratio explicitly

Construct the full prompt using the patterns in `prompting-patterns.md`.

### Step 4 - Generate via nano banana

Follow the bash pattern in `prompting-patterns.md`. Key points:
- Read API key from `00_System/system_config.md` (extract the value, never log it back)
- Include the user's face reference image (base64-encoded) BEFORE the text part for likeness matching
- Save outputs to `04_YouTube/Scripts/[video-slug]/thumbnails/option-N.png`
- If the script folder doesn't exist for this video, create it
- Sleep 1 second between batch generations (rate limit)

### Step 5 - Resize/crop to 1280x720

After generation, resize to YouTube's 1280x720 standard:
```bash
sips -z 720 1280 input.png --out output-1280x720.png
```

### Step 6 - Text overlay (separate pass)

Nano banana garbles text. Generate the visual cleanly first, then overlay text using ONE of:

**Option A - Programmatic (ImageMagick):**
```bash
convert input.png \
  -gravity Center \
  -font [font from brand-visuals.md] \
  -pointsize [large, e.g. 120] \
  -fill [color from brand-visuals.md, e.g. white] \
  -stroke black -strokewidth 4 \
  -annotate +0+0 "PHRASE" \
  output-with-text.png
```

**Option B - Hand off to user:**
Tell the user the visual is ready in `04_YouTube/Scripts/[video-slug]/thumbnails/`. They can drop the text on in Figma/Canva/Photoshop using the brand fonts and colors from `core_brand-visuals.md`.

Default to Option B unless the user specifies they want programmatic overlay.

### Step 7 - Present to user

Show all generated thumbnails. For each:
- File path
- Which thumbnail phrase it visualises
- Gap type used (desirable result / haven't seen this)
- Brief note on the visual concept

Ask:
> "Which of these are working? Anything to iterate on - the face, the composition, the colors, the mood?"

If the user wants iterations, see the iteration table in `prompting-patterns.md` for common fixes.

---

## Naming and saving

```
04_YouTube/Scripts/[video-slug]/thumbnails/
├── option-1-[phrase-slug].png        (raw generated)
├── option-1-[phrase-slug]-1280x720.png (resized)
├── option-1-[phrase-slug]-final.png   (with text overlay, if applied)
├── option-2-[phrase-slug].png
└── ...
```

phrase-slug = first 2-3 words of the phrase, lowercase, hyphens.

---

## Rules

- Always read the bundled universal layer (`design-principles.md`, `prompting-patterns.md`) before generating.
- Always read the personal layer (`core_brand-visuals.md`, `thumbnail-style.md`) before generating - the output is generic without it.
- Never invent proof points, results, or numbers to put on a thumbnail. Pull only from user-provided context.
- Never repeat the title in the thumbnail text.
- Always 16:9 / 1280x720 final output.
- Generate the visual via nano banana. Overlay text separately - don't rely on nano banana for text rendering.
- Never use - (em dash). Use - instead.
- Save all generated thumbnails to `04_YouTube/Scripts/[video-slug]/thumbnails/`.
- Never log or print the API key to the user.
