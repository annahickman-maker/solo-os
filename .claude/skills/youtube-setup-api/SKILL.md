---
name: youtube-setup-api
description: 'One-time setup that connects the dashboard to YouTube. Walks the user through getting a free YouTube Data API key, configuring channels to monitor and keywords for the Title Radar, and saving everything so the dashboard''s title generator, channel stats, Title Radar, and analytics surfaces all work. Use when the user says "set up the YouTube API", "connect YouTube", "set up title radar", "set up YouTube analytics", or when /youtube-title detects the API isn''t connected.'
category: Research
hidden: true
---

# YouTube Setup - API Connection

One-time setup. Replaces the older split (`youtube-setup-title-radar` + `youtube-setup-analytics`) with a single unified workflow.

What this skill does:

1. Gets the user a free YouTube Data API v3 key
2. Asks for the channels they monitor and the keywords their audience searches
3. Saves the API key to BOTH `scripts/title_radar_config.py` (for the Python radar script) AND `dashboard/server/.env` (so the dashboard server can read channel stats and analytics directly)
4. Creates `06_Swipe/asset_title-radar.md` for the radar's output to land in

After this skill finishes, all YouTube features in the dashboard work: Title Radar in the title generator, channel stats on the Content page, the analytics review surface.

---

## Preflight

1. This is infrastructure setup - it connects the dashboard to YouTube and doesn't depend on channel positioning. Your foundation comes from Solo OS onboarding (the `01_Core/` files). If your core files aren't set up yet, stop and say: run /solopreneur-onboarding first - then come back here.
2. Check whether this is already set up by looking for `scripts/title_radar_config.py` AND a `YOUTUBE_API_KEY=` line in `dashboard/server/.env`. If both exist, ask: "YouTube API is already connected. Want to reconfigure (change API key, channels, or keywords), or quit?"

---

## Required inputs (gathered during the walkthrough)

- A free YouTube Data API v3 key (user gets it from Google Cloud Console)
- 3-5 YouTube channel handles to monitor (creators in the user's niche)
- 10-15 keyword terms representing the user's niche topics

---

## Welcome

> "This connects your dashboard to YouTube. One API key powers everything YouTube-related: the Title Radar (so your generated titles know what's currently outperforming in your niche), the Content page (so it can pull your channel stats), and the analytics review surface.
>
> Setup takes about 10-15 minutes. You'll need a Google account, but the API key itself is free. Ready?"

Wait for confirmation.

---

## Rules for the walkthrough

- One step at a time. Never show the next step until the current one is confirmed.
- Never guess at what the user sees - if their screen looks different from your description, ask them to paste what they see.
- If any step fails, stop and troubleshoot before moving on.

---

## Step 1 - Get the YouTube Data API key

Tell the user:

> "First, the YouTube API key. This is what lets the dashboard pull YouTube data on your behalf.
>
> **What to do:**
>
> 1. Open Google Cloud Console: https://console.cloud.google.com
> 2. Sign in with any Google account
> 3. Create a new project. Click the project dropdown at the top, then **New Project**. Name it "Solo OS" (or anything you like). Click **Create**.
> 4. Make sure your new project is selected in the dropdown at the top.
> 5. In the left sidebar: **APIs & Services → Library**
> 6. Search for **YouTube Data API v3** and click on it
> 7. Click **Enable**
> 8. Now go to **APIs & Services → Credentials**
> 9. Click **+ Create Credentials → API Key**
> 10. Copy the key it gives you
>
> Paste the key in chat when you have it and I'll save it for you."

STOP - wait for the user to share the key.

---

## Step 2 - Save the key to both config files

Once the user pastes the key, save it to TWO places:

### A) `scripts/title_radar_config.py`

Create the file if it doesn't exist. Structure:

```python
# YouTube + Title Radar Configuration
# This file is never overwritten by system updates - your settings stay safe.

YOUTUBE_API_KEY = "[the user's key]"

# Channels to monitor - creators in your niche
# Use the @handle without the @ symbol (e.g., "realmattgray" not "@realmattgray")
CHANNELS_TO_MONITOR = [
    # Filled in Step 3
]

# Keyword terms - what your audience searches for
KEYWORD_TERMS = [
    # Filled in Step 4
]

# How many videos to scan per channel (default 50)
VIDEOS_PER_CHANNEL = 50

# Outlier threshold - how many times above the channel's typical view count
# a video has to be to count as an outlier (default 2.0 = 2x average)
OUTLIER_THRESHOLD = 2.0
```

### B) `dashboard/server/.env`

Find the dashboard's server `.env` file. Likely paths to check (in order):

1. `~/Desktop/solo-os/server/.env` (default for SS members on Mac)
2. `~/Desktop/solo-os/server/.env` on Windows (same path with home dir resolved)
3. `dashboard/server/.env` relative to the vault folder
4. Whatever path the user confirms via `find ~/Desktop -name ".env" -path "*server*" 2>/dev/null`

Append (or update existing) line:

```
YOUTUBE_API_KEY=[the user's key]
```

If a `YOUTUBE_API_KEY=` line already exists, replace its value. Don't duplicate.

After saving both:

> "Saved your API key in two places: the Python config (used by the Title Radar script) and the dashboard server's environment file (used by every YouTube feature on the dashboard). One key, both surfaces work."

> "Important: the dashboard server caches environment variables on startup. You'll need to restart the dashboard for it to pick up the new key. To do that, quit Solo OS, then re-open it from your Applications folder (Mac) or Desktop shortcut (Windows)."

STOP - confirm before continuing.

---

## Step 3 - Choose channels to monitor

> "Now the channels the Title Radar will watch.
>
> These should be 3-5 creators in your niche - people whose content is aimed at a similar audience to yours. You're not copying them. You're watching what titles are getting outsized results on their channels so you can learn what title structures are working right now.
>
> Who comes to mind? Give me their YouTube handles - the @username on their channel page."

When they provide names:
- Strip any leading @ symbols
- Confirm the format
- Write into `CHANNELS_TO_MONITOR` in `scripts/title_radar_config.py`

> "Added those channels. Tell me if you want to add or change any before we move on."

STOP - confirm before continuing.

---

## Step 4 - Set keyword terms

> "Last config step. The Title Radar also pulls titles from keyword searches across YouTube - this shows what title structures are common vs what's breaking through.
>
> The keywords need to match your actual topic, not someone else's niche.
>
> What are the main topics, phrases, or search terms your audience would type into YouTube if they were looking for content like yours? Give me 10-15 terms."

When they provide terms:
- Clean up the formatting (lowercase, trim whitespace)
- Write into `KEYWORD_TERMS` in `scripts/title_radar_config.py`

> "Saved your keywords. Configuration is complete."

STOP - confirm before continuing.

---

## Step 5 - Create the radar asset file

Create `06_Swipe/asset_title-radar.md` (don't overwrite if it exists):

```markdown
---
type: asset
slug: title-radar
status: active
tags:
  - type/asset
  - domain/youtube
aliases:
  - Title Radar
---

# Title Radar

Configured channels and keywords being monitored. Scan results below get refreshed every time /youtube-title runs the radar script.

## Configuration
See `scripts/title_radar_config.py` for the live config (API key, channels, keywords).

## Last scanned
[Auto-populated when scripts/title_radar.py runs]

## Latest scan results

### Channel outliers
[Auto-populated - titles from monitored channels that significantly outperformed that channel's average]

### Keyword search results
[Auto-populated - current titles appearing in your niche keyword searches]

## Scan history
[Each scan timestamp is logged here]
```

---

## Step 6 - Test the connection

> "Everything is configured. Let's test that it actually works.
>
> Run a Title Radar scan from your terminal:
>
> ```
> python3 scripts/title_radar.py
> ```
>
> It will take a minute or two. You'll see it scanning each channel and collecting keyword results. When it finishes, it says 'Done.'
>
> Then restart your dashboard (quit Solo OS and re-open it). The new API key will be picked up.
>
> Tell me when both are done."

STOP - wait for confirmation.

If the Python script errors with `quotaExceeded` or `keyInvalid`, troubleshoot the API key. Most common cause: the key isn't restricted to the right API. Have the user go back to Google Cloud Console → Credentials → click the key → check that "API restrictions" includes YouTube Data API v3 (or set to "Don't restrict key" if they want it simple).

---

## Step 7 - Confirm and close

> "You're connected. From here:
>
> - Every time you generate titles for a video, the Title Radar runs first and informs the suggestions with what's currently outperforming in your niche
> - Your Content page can read your YouTube channel stats
> - The analytics review surface on the Content page now works - you can run a channel-wide review any time
>
> The Title Radar config stays separate from system updates, so you can update Solo OS without losing your API key, channels, or keywords."

---

## After this skill runs

Other skills depend on this being done:

- `/youtube-title` - checks for the radar config and runs the scan before generating titles
- `/youtube-analytics` - reads from the dashboard's YouTube API connection
- The dashboard's Content page surfaces - pull stats live from the YouTube API

Mark the two older skills as deprecated:

- `youtube-setup-title-radar` - superseded by this skill
- `youtube-setup-analytics` - superseded; Google Sheet + Apps Script approach removed in favor of the dashboard's built-in analytics surface
