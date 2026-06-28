---
name: connect-nano-banana
description: 'Walk a dashboard user through connecting Nano Banana (Google Gemini image generation) so they can auto-generate avatar portraits and YouTube thumbnails inside the dashboard. Triggered by phrases like "connect Nano Banana", "set up image generation", "enable avatar images", or the "Connect Nano Banana" card in Settings. Guides them to a free Google AI Studio API key, captures it, sends it to the local dashboard server which tests + saves it, then confirms. The key stays on the user''s machine. Read this whole file before starting - the steps are linear and the user does manual browser work between them.'
title: Connect Nano Banana
card: Set up image generation (avatars + thumbnails)
category: Create
hidden: true
---

# Connect Nano Banana to the dashboard

A one-time setup that wires the user's own Google Gemini API key into the dashboard so the avatar image generator and the thumbnail skill can create images. The user owns the key; nothing is shared. It is saved locally to `04_Channel/00_System/system_config.md` as a `GEMINI_API_KEY:` line.

## Before you start

Confirm the dashboard is running (the user can see it open in a browser tab). Tell them up front: "This takes about 3 minutes. You'll grab one free API key from Google, paste it to me, and I'll save and test it. It's free for normal use."

Do not try to automate the Google AI Studio page - it is a manual click the user does. Give one clear step at a time and wait for them.

One prerequisite: a Google account. That's it. No billing or card is required for the free tier.

## Step 1 - Get the free API key

Ask the user to open https://aistudio.google.com/apikey (Google AI Studio).

Tell them:
- Sign in with their Google account if prompted.
- Click **Create API key** (or **Get API key** -> **Create API key in new project** if they have no project yet).
- A long string starting with `AIza...` appears. Click **Copy**.

Wait for "done".

## Step 2 - Paste the key

Tell them: "Paste the key here and I'll save it. It looks like `AIzaSy...` and is about 39 characters."

Wait for the key. Trim any stray spaces from the paste.

## Step 3 - Save and test it

POST the key to the dashboard server. The endpoint runs one tiny test generation against Gemini BEFORE saving - if the key is wrong or has no image access, it returns an error and nothing is saved.

```bash
curl -s -X POST -H "content-type: application/json" \
  "http://localhost:8790/api/nano-banana/key?pw=dev" \
  -d '{"key":"<the key they pasted>"}'
```

(The port is the dashboard server's port - `8790` for the local Solo OS stack. If the call cannot connect, confirm the dashboard is running and check the port.)

Expected on success: `{"ok":true,"key_preview":"...XXXX"}`.

If you see `{"error":"key test failed ..."}`:
- A leading/trailing space on the paste is the most common cause - ask them to paste it again cleanly.
- "no image / no image generation access" means the key is valid but the project can't reach the image model - ask them to create the key in a fresh project at the same link, or enable the Generative Language API for that project.

## Step 4 - Confirm

Check the saved status:

```bash
curl -s "http://localhost:8790/api/nano-banana/status?pw=dev"
```

Expected: `{"connected":true,"key_preview":"...XXXX"}`.

When that's what you see, tell the user: "Done - Nano Banana is connected. The 'Connect Nano Banana' card in Settings is gone now, and the avatar image buttons on your offer page will generate portraits. Same key powers your YouTube thumbnails."

## What gets stored where

- The key: `04_Channel/00_System/system_config.md`, as a single `GEMINI_API_KEY: <value>` line (the file/line is created if missing). Nothing else changes.
- Nothing is sent anywhere except Google's API, from the user's machine, when they generate an image.

## Rules

- Never paste a key the user did not give you, and never invent one.
- No em dashes anywhere. Hyphens only.
