---
name: nano-banana-integration
description: Technical integration patterns for generating images with Google's Nano Banana (Gemini 2.5 Flash Image) model via the Gemini API. Use when generating brand photography, moodboard imagery, strategy deck images, or any image generation task. Covers curl-based API calls, authentication, request structure, response parsing, saving images, error handling, and batch generation. Used together with the ai-image-prompting skill.
---

# Nano Banana Integration

Nano Banana is the unofficial name for Google's Gemini 2.5 Flash Image model. It's the best AI image generation model for photorealistic brand imagery. This skill contains the exact technical patterns for integrating it into Web Design OS workflows.

This skill is Claude's technical reference. The user doesn't need to know any of this - they just run workflows and Claude handles the API calls.

---

## When this skill is used

Auto-loads when Claude is:
- Running `workflow_generate-visual-direction.md`
- Running `workflow_curate-visuals.md` for regeneration
- Any task involving image generation via the Gemini API
- Debugging image generation issues

---

## Prerequisites

Before Claude can use this skill, the user must have completed `workflow_setup-nano-banana.md`, which:
1. Created a Gemini API key at Google AI Studio
2. Saved the key to `00_System/system_config.md` (gitignored)
3. Verified the integration with a test generation

If Claude tries to use this skill and the config is missing, stop and run the setup workflow first.

---

## Loading the API key

The API key is stored in `00_System/system_config.md`. Read it from there.

**File format:**
```
---
type: system
slug: config
status: active
---

# System Config

GEMINI_API_KEY: AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX

# Other config values
...
```

**Reading the key:**
Use the Read tool to read `00_System/system_config.md`, then extract the `GEMINI_API_KEY:` value.

Never store the key in prompts or in files that will be committed to git. The config file is gitignored.

---

## API endpoint and model

**Base URL:** `https://generativelanguage.googleapis.com/v1beta/models/`

**Model:** `gemini-2.5-flash-image:generateContent`

**Full endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`

---

## Basic generation request

### curl command structure

```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "YOUR_PROMPT_HERE"
      }]
    }]
  }'
```

### When Claude runs this

1. Read the API key from `00_System/system_config.md`
2. Set it as an environment variable for the bash session: `export GEMINI_API_KEY="..."`
3. Construct the prompt using the `ai-image-prompting` skill
4. Execute the curl command via the Bash tool
5. Parse the response
6. Save the image to the correct location

### Full working example

```bash
# Set the API key (Claude reads this from config)
export GEMINI_API_KEY="AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Make the generation request
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Candid medium shot of a woman in her 30s holding a ceramic coffee cup in a minimalist kitchen, shot on Kodak Portra 400, natural morning light from the left window, warm earth tones, shallow depth of field, editorial lifestyle photography in the style of Kinfolk magazine"
      }]
    }]
  }' \
  -o response.json
```

---

## Response structure

The Gemini API returns JSON with the generated image as a base64-encoded string.

### Typical response

```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "inlineData": {
          "mimeType": "image/png",
          "data": "iVBORw0KGgoAAAANSUhEUgAAA..."
        }
      }],
      "role": "model"
    },
    "finishReason": "STOP",
    "index": 0
  }]
}
```

### Extracting and saving the image

The image data is at: `candidates[0].content.parts[0].inlineData.data`

**Bash command to extract and save as PNG:**

```bash
# Extract the base64 data and save as PNG
cat response.json | python3 -c "
import json, base64, sys
data = json.load(sys.stdin)
image_data = data['candidates'][0]['content']['parts'][0]['inlineData']['data']
with open('output.png', 'wb') as f:
    f.write(base64.b64decode(image_data))
print('Saved to output.png')
"
```

**Alternative using jq (if available):**

```bash
cat response.json | jq -r '.candidates[0].content.parts[0].inlineData.data' | base64 -d > output.png
```

---

## Complete single-image generation pattern

Here's the full pattern Claude should follow for generating one image:

```bash
#!/bin/bash

# Step 1: Read API key from config (Claude extracts this value beforehand)
export GEMINI_API_KEY="VALUE_FROM_CONFIG"

# Step 2: Define the prompt
PROMPT='Candid medium shot of a woman in her 30s holding a ceramic coffee cup in a minimalist kitchen, shot on Kodak Portra 400, natural morning light from the left window, warm earth tones, shallow depth of field, editorial lifestyle photography in the style of Kinfolk magazine'

# Step 3: Define the output path
OUTPUT_PATH="04_Clients/acme-corp/assets/generated/cover.png"

# Step 4: Make sure output directory exists
mkdir -p "$(dirname "$OUTPUT_PATH")"

# Step 5: Call the API
RESPONSE=$(curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contents\": [{
      \"parts\": [{
        \"text\": \"$PROMPT\"
      }]
    }]
  }")

# Step 6: Extract the base64 data and save as image
echo "$RESPONSE" | python3 -c "
import json, base64, sys
try:
    data = json.load(sys.stdin)
    image_data = data['candidates'][0]['content']['parts'][0]['inlineData']['data']
    with open('$OUTPUT_PATH', 'wb') as f:
        f.write(base64.b64decode(image_data))
    print('SUCCESS: Saved to $OUTPUT_PATH')
except (KeyError, IndexError, json.JSONDecodeError) as e:
    print(f'ERROR: {e}')
    print(data if 'data' in dir() else 'No data')
"
```

---

## Batch generation pattern

For generating multiple images (like a moodboard of 9 images), loop the generation:

```bash
#!/bin/bash

export GEMINI_API_KEY="VALUE_FROM_CONFIG"

CLIENT_DIR="04_Clients/acme-corp/assets/generated"
mkdir -p "$CLIENT_DIR"

# Define all prompts in an array
declare -a PROMPTS=(
    "Prompt 1 for moodboard-01.png"
    "Prompt 2 for moodboard-02.png"
    "Prompt 3 for moodboard-03.png"
    "Prompt 4 for moodboard-04.png"
    "Prompt 5 for moodboard-05.png"
    "Prompt 6 for moodboard-06.png"
    "Prompt 7 for moodboard-07.png"
    "Prompt 8 for moodboard-08.png"
    "Prompt 9 for moodboard-09.png"
)

# Loop through prompts
for i in "${!PROMPTS[@]}"; do
    INDEX=$(printf "%02d" $((i+1)))
    OUTPUT="$CLIENT_DIR/moodboard-$INDEX.png"

    echo "Generating moodboard-$INDEX.png..."

    RESPONSE=$(curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"contents\": [{
          \"parts\": [{
            \"text\": \"${PROMPTS[$i]}\"
          }]
        }]
      }")

    echo "$RESPONSE" | python3 -c "
import json, base64, sys
try:
    data = json.load(sys.stdin)
    image_data = data['candidates'][0]['content']['parts'][0]['inlineData']['data']
    with open('$OUTPUT', 'wb') as f:
        f.write(base64.b64decode(image_data))
    print('  Saved: $OUTPUT')
except Exception as e:
    print(f'  ERROR: {e}')
"

    # Rate limiting - wait 1 second between requests
    sleep 1
done

echo "Batch generation complete."
```

---

## Image editing (not just generation)

Nano Banana also supports image editing - modifying an existing image with a prompt. This is useful for:
- Removing backgrounds
- Changing lighting on existing photos
- Restyling client-provided images
- Creating variations

### Edit request structure

```bash
# Read existing image and encode as base64
EXISTING_IMAGE=$(base64 -i input.png)

curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contents\": [{
      \"parts\": [
        {
          \"inlineData\": {
            \"mimeType\": \"image/png\",
            \"data\": \"$EXISTING_IMAGE\"
          }
        },
        {
          \"text\": \"Modify this image: change the lighting to golden hour, warmer tones, more cinematic feel\"
        }
      ]
    }]
  }"
```

The response format is identical to generation - extract `candidates[0].content.parts[0].inlineData.data`.

---

## Error handling

### Common errors and responses

**Error: API key invalid**
```json
{
  "error": {
    "code": 400,
    "message": "API key not valid. Please pass a valid API key.",
    "status": "INVALID_ARGUMENT"
  }
}
```

**Fix:** Re-check the API key in `00_System/system_config.md`. Run `workflow_setup-nano-banana.md` to reset.

**Error: Quota exceeded**
```json
{
  "error": {
    "code": 429,
    "message": "Resource has been exhausted (e.g. check quota).",
    "status": "RESOURCE_EXHAUSTED"
  }
}
```

**Fix:** User has hit their rate limit or daily quota. Wait and retry, or upgrade their Google Cloud billing.

**Error: Content policy violation**
```json
{
  "candidates": [{
    "finishReason": "SAFETY",
    "safetyRatings": [...]
  }]
}
```

**Fix:** The prompt triggered a safety filter. Reword to avoid people-specific descriptions, nudity, violence, or copyrighted references.

**Error: Empty response**
If `candidates[0].content.parts[0].inlineData` doesn't exist, the model returned text instead of an image (rare but possible). Retry with a clearer image-generation prompt.

### Retry pattern

For transient failures, implement simple retry logic:

```bash
generate_with_retry() {
    local PROMPT=$1
    local OUTPUT=$2
    local MAX_RETRIES=3
    local ATTEMPT=1

    while [ $ATTEMPT -le $MAX_RETRIES ]; do
        echo "Attempt $ATTEMPT..."

        RESPONSE=$(curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GEMINI_API_KEY" \
          -H "Content-Type: application/json" \
          -d "{\"contents\":[{\"parts\":[{\"text\":\"$PROMPT\"}]}]}")

        SUCCESS=$(echo "$RESPONSE" | python3 -c "
import json, base64, sys
try:
    data = json.load(sys.stdin)
    image_data = data['candidates'][0]['content']['parts'][0]['inlineData']['data']
    with open('$OUTPUT', 'wb') as f:
        f.write(base64.b64decode(image_data))
    print('success')
except Exception:
    print('fail')
")

        if [ "$SUCCESS" = "success" ]; then
            return 0
        fi

        ATTEMPT=$((ATTEMPT+1))
        sleep $((ATTEMPT * 2))
    done

    echo "Failed after $MAX_RETRIES attempts"
    return 1
}
```

---

## Cost and rate limits

### Approximate costs (as of early 2026)

- Gemini 2.5 Flash Image: ~$0.02-0.04 per image generation
- Free tier: limited requests per minute, per day
- Paid tier: higher limits, pay per use

A typical Visual Direction Engine run generates:
- 1 cover image
- 5 section dividers
- 2-4 persona portraits
- 9 moodboard images
- 1 closing image
- **Total: ~18-20 images = $0.36-0.80 per client**

This is trivial compared to the time savings the workflow provides.

### Rate limiting

- Free tier: 2 requests per minute, 50 per day
- Paid tier: 60 requests per minute, 1000 per day (varies)

For batch generation, add `sleep 1` between requests to stay under rate limits.

---

## File naming conventions

Images generated by workflows should follow the strategy deck slot convention:

```
04_Clients/[client-slug]/assets/generated/
├── cover.png
├── contents.png
├── section-identity.png
├── section-audience.png
├── section-marketing.png
├── section-website.png
├── section-creative.png
├── identity-accent.png
├── values.png
├── persona-1.png
├── persona-2.png
├── moodboard-01.png through moodboard-09.png
├── inspiration-01.png through inspiration-03.png
└── closing.png
```

After curation (manual review), approved images move to:

```
04_Clients/[client-slug]/assets/curated/
```

The strategy deck template references `assets/curated/` so only approved images display.

---

## Output format

Nano Banana always returns PNG format. If the workflow needs JPG for smaller file size:

```bash
# Convert PNG to JPG after generation
sips -s format jpeg -s formatOptions 85 input.png --out output.jpg

# Or using ImageMagick if available
convert input.png -quality 85 output.jpg
```

Most use cases should keep PNG for quality.

---

## Testing the integration

A simple test prompt to verify the setup works:

```bash
export GEMINI_API_KEY="YOUR_KEY"

curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "A single red apple on a white marble surface, soft natural light, minimal editorial photography"
      }]
    }]
  }' | python3 -c "
import json, base64, sys
try:
    data = json.load(sys.stdin)
    if 'candidates' in data and data['candidates'][0].get('content', {}).get('parts'):
        parts = data['candidates'][0]['content']['parts']
        for part in parts:
            if 'inlineData' in part:
                with open('test-output.png', 'wb') as f:
                    f.write(base64.b64decode(part['inlineData']['data']))
                print('SUCCESS: test-output.png created')
                break
        else:
            print('WARNING: No image in response')
    else:
        print('ERROR: Unexpected response structure')
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f'ERROR: {e}')
"
```

If this produces a valid `test-output.png`, the integration is working.

---

## Key reminders for Claude

When using this skill in a workflow:

1. **Always read the API key from `00_System/system_config.md` first** - never hardcode or guess it
2. **If the config file doesn't exist or has no key, stop and run `workflow_setup-nano-banana.md`**
3. **Use the `ai-image-prompting` skill for prompt construction** - this skill is about the API, the other is about the prompts
4. **Save images to the correct path** following the naming convention
5. **Handle rate limits** with sleep between batch requests
6. **Report progress to the user** during batch generation (it takes time)
7. **On errors, tell the user clearly** what went wrong and how to fix it
8. **Never commit API keys** - the config file must be gitignored
