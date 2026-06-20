# Nano Banana Prompting Patterns for Thumbnails

Technical reference for generating YouTube thumbnails via Google's Gemini 2.5 Flash Image (Nano Banana). This file is Claude's reference - the user doesn't need to read it.

---

## API setup

The API key lives in `00_System/system_config.md`:

```
GEMINI_API_KEY: AIzaSy[...]
```

If the file doesn't exist or has no key, STOP and tell the user to set up nano banana first via /youtube-setup-thumbnail-brand (which includes API setup).

**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`

---

## What nano banana does well

- **Photorealistic portraits** - believable lighting, skin texture, expressions
- **Composition control** - "centered subject", "rule of thirds", "shot from above" all work
- **Lighting** - golden hour, studio, natural window light, dramatic, moody
- **Style references** - "shot on Kodak Portra 400", "in the style of Annie Leibovitz", "editorial photography"
- **Reference image conditioning** - feed it a face photo and it can produce variations that look like the same person (much more reliable than text-only)

## What nano banana struggles with

- **Text rendering** - it CAN render text but often misspells, garbles, or distorts it. Don't rely on it for the thumbnail's text overlay. Generate the background/portrait, then overlay text in post-processing or via a second pass.
- **Exact face matching** - even with a reference photo, the output looks "like" the person, not identical. Set expectations accordingly.
- **Tiny details** - small logos, fine typography, exact brand color match without specification

---

## Strategy for YouTube thumbnails

Two-pass approach is the most reliable:

### Pass 1 - Generate the visual (background + face/subject, no text)

Generate a clean visual with the face/subject and background composition, leaving space for text overlay. Don't ask nano banana to write the text on the image - it'll botch it.

### Pass 2 - Overlay text

After generating the visual, overlay the text using one of:
- ImageMagick (`convert` command)
- Python PIL/Pillow
- A canvas tool (handed off to user)
- A second nano banana edit pass with the text instruction (works sometimes, fails often)

For the prototype, generate the visual via nano banana and either overlay text programmatically OR hand off to the user to drop the text in their thumbnail tool of choice (Figma, Photoshop, Canva).

---

## Thumbnail prompt structure

A reliable thumbnail prompt has these components, in this order:

```
[Shot type] [subject] [expression/pose] in [environment/background],
[lighting], [style/film reference], [composition note for text space],
[aspect ratio: 16:9 / YouTube thumbnail],
[brand color hints if relevant]
```

### Example - face-forward thumbnail

```
Medium close-up portrait of [person description from reference photo],
expression of [specific emotion: shock / determined frustration / disbelief / conviction],
[setting/background that fits the video topic],
dramatic side lighting, high contrast,
shot on Sony A7IV with 85mm lens,
subject positioned on the LEFT THIRD of the frame leaving the right two-thirds
mostly clear for text overlay (negative space, blurred background),
16:9 YouTube thumbnail composition,
[brand color: e.g. warm earth tones / cool blues / saturated red accent]
```

### Example - object-led thumbnail

```
[Object] [in/on/with] [environment],
[lighting and mood],
shot on [camera/film reference] for editorial quality,
composition leaves the [left/right/top/bottom] third clear for text,
high contrast against [background type],
16:9 YouTube thumbnail aspect ratio
```

### Example - concept/metaphor thumbnail

```
Visual metaphor: [the concept rendered visually],
[style description - photorealistic / illustrated / mixed media],
[mood and color palette],
clean composition with strong focal point on [element],
16:9 YouTube thumbnail
```

---

## Reference image conditioning (use the user's face photo)

When the user has a face reference in `01_Core/core_brand-visuals.md`, include the photo in the API call so the generated portrait resembles them.

```bash
# Read existing reference image and encode as base64
REFERENCE_IMAGE=$(base64 -i "/path/to/face-reference.png")

curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contents\": [{
      \"parts\": [
        {
          \"inlineData\": {
            \"mimeType\": \"image/png\",
            \"data\": \"$REFERENCE_IMAGE\"
          }
        },
        {
          \"text\": \"Generate a YouTube thumbnail in this person's likeness: [thumbnail prompt]\"
        }
      ]
    }]
  }"
```

The reference image goes BEFORE the text part. Nano banana matches the likeness more reliably this way.

---

## Generation pattern

Full bash pattern for generating one thumbnail:

```bash
#!/bin/bash

# Read API key from config
GEMINI_API_KEY=$(grep "GEMINI_API_KEY:" "01_Core/../00_System/system_config.md" | awk '{print $2}')
export GEMINI_API_KEY

# Define paths
OUTPUT_DIR="04_YouTube/Scripts/[video-slug]/thumbnails"
mkdir -p "$OUTPUT_DIR"
OUTPUT_PATH="$OUTPUT_DIR/option-1.png"

# Reference photo (from core_brand-visuals.md)
REFERENCE_PATH="[path to face reference]"

# Build prompt
PROMPT="[constructed prompt from thumbnail-style.md + video context + thumbnail phrase]"

# Encode reference image
REFERENCE_IMAGE=$(base64 -i "$REFERENCE_PATH")

# Call API
RESPONSE=$(curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contents\": [{
      \"parts\": [
        { \"inlineData\": { \"mimeType\": \"image/png\", \"data\": \"$REFERENCE_IMAGE\" } },
        { \"text\": \"$PROMPT\" }
      ]
    }]
  }")

# Extract and save
echo "$RESPONSE" | python3 -c "
import json, base64, sys
data = json.load(sys.stdin)
image_data = data['candidates'][0]['content']['parts'][0]['inlineData']['data']
with open('$OUTPUT_PATH', 'wb') as f:
    f.write(base64.b64decode(image_data))
print('Saved:', '$OUTPUT_PATH')
"
```

---

## Output specs

- **Aspect ratio:** 16:9 (YouTube standard)
- **Resolution:** Aim for 1280x720 minimum (YouTube's recommended). Nano banana typically returns ~1024x1024 - upscale if needed using `sips` (Mac) or ImageMagick.
- **Format:** PNG (default from API)
- **Save path:** `04_YouTube/Scripts/[video-slug]/thumbnails/`

### Resize/crop to 1280x720 after generation

```bash
# Mac (sips)
sips -z 720 1280 input.png --out output-1280x720.png

# ImageMagick
convert input.png -resize 1280x720^ -gravity center -extent 1280x720 output.png
```

---

## Iteration pattern

If the first generation isn't right, common fixes:

| Problem | Prompt fix |
|---|---|
| Face doesn't look like the user | Include reference image (base64) BEFORE text part |
| Wrong emotion | Be more specific - not "intense" but "frustrated disbelief" or "determined fury" |
| Too cluttered | Add "minimal background", "negative space", "single subject" |
| Wrong composition | Specify "subject positioned in the left third" or "rule of thirds, eyes on upper third" |
| Wrong style | Add film/camera reference: "shot on Kodak Portra 400" / "Sony A7 III, 85mm" |
| Wrong colors | Specify hex codes or named palettes: "muted warm earth tones - terracotta, cream, deep brown" |
| Generic feel | Add specificity to the environment, props, lighting direction |

Don't iterate more than 3-4 times on the same prompt. If it's still wrong, the prompt is structurally off - rewrite from scratch.

---

## Cost note

~$0.02-0.04 per generation. Batch of 5 thumbnail options ≈ $0.10-0.20. Trivial.

---

## Failure modes

- **Empty response** - retry once. If empty again, check API key and quota.
- **Safety filter** - reword to remove people-specific descriptions, dramatic phrases ("kill", "destroy"), or copyrighted references.
- **Garbled text in image** - expected. Don't rely on nano banana for text. Overlay separately.
- **Person doesn't match** - reference image wasn't included or was too low quality. Use a clear, well-lit front-facing photo.
