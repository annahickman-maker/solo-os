---
name: youtube-update
description: System maintenance skill that checks for and installs updates to YouTube skill pack files (skills, scripts, frameworks, asset templates). User personal files - core onboarding output, projects, scripts, transcripts, archived content - are NEVER touched. Shows the user what's changed before applying any update. Use when the user says "update the system", "check for updates", "update YouTube skills", or "install latest".
---

# YouTube Update

System maintenance. Updates the YouTube skill pack files to the latest version. Personal user files are never touched.

---

## What gets updated

- Skill files in `.claude/skills/youtube-*/SKILL.md` and bundled resources
- Scripts: `scripts/title_radar.py`, `scripts/update_system.sh`
- Asset templates (the empty structures, NOT the user's populated content)
- Bundled phase files inside `.claude/skills/solopreneur-onboarding/`

## What is NEVER updated (user-owned files)

- `01_Core/` (user's onboarding output - positioning, audience, story, voice, IP, offer suite)
- `04_YouTube/core_channel-positioning.md` (user's channel positioning answers)
- `04_YouTube/video-cue.md` (user's video queue)
- `04_YouTube/Scripts/`, `04_YouTube/Transcripts/`, `04_YouTube/Archive/`
- `03_Projects/` (in-progress work)
- `06_Swipe/asset_*.md` populated content (the user's logged patterns, swipe entries)
- `00_System/system_analytics-config.md` (user's API keys, sheet URLs, etc)
- `scripts/title_radar_config.py` (user's API key + monitored channels)

The rule: anything that contains the user's specific data is theirs. Templates and skill logic are updateable.

---

## Trigger

User says:
- "update the system"
- "check for updates"
- "update YouTube skills"
- "install latest"
- "update YouTube OS"

---

## Step 1 - Explain what's about to happen

Tell the user:

> "I'm going to check for updates to the YouTube skill pack - skill files, scripts, and asset templates. Your personal files (core onboarding output, channel positioning, scripts, transcripts, archive, projects, your logged patterns) won't be touched. I'll show you what's changed before installing anything."

Wait for confirmation. If they say no or want to know more, answer their question first.

---

## Step 2 - Run the update check

Run the update script:

```bash
bash scripts/update_system.sh
```

This script (assumed to live in the user's vault) is responsible for:
- Comparing current skill pack files against the latest version (e.g. from a git remote, a release tarball, or a configured update source)
- Reporting what's changed
- NOT applying anything yet

If `scripts/update_system.sh` doesn't exist, tell the user:
> "Looks like `scripts/update_system.sh` isn't in your vault. This usually means the vault wasn't set up using the clone/install method. Let me know if you need help fixing this - the update mechanism varies based on how the skill pack was distributed to you."

Then stop.

---

## Step 3 - Report what's changed

Read the script's output. Three possible outcomes:

### A - Already up to date

> "Your YouTube skill pack is up to date. No changes needed."

Stop here.

### B - Updates available

Present a clear summary:

> "Updates available. Here's what would change:
>
> **New skills:**
> - [skill-name] - [one-line description]
>
> **Updated skills:**
> - [skill-name] - [what changed]
>
> **Updated scripts:**
> - [script-name] - [what changed]
>
> **Updated templates:**
> - [template-name] - [what changed]
>
> Your personal files won't be touched. Install these updates?"

Wait for the user's answer. If yes, proceed to Step 4. If no, stop here and tell them they can run the update later.

### C - Error

If the update check failed (no internet, source not configured, permissions issue):

> "Update check failed. The error was: [error message]. This usually means [diagnosis based on the error]. Let me know if you need help fixing this."

Stop here. Don't try to install anything.

---

## Step 4 - Install the updates

If the user confirmed in Step 3B, run the script with the install flag:

```bash
bash scripts/update_system.sh --install
```

The script handles:
- Backing up existing files (so the user can roll back if something breaks)
- Replacing only the skill pack files (skills, scripts, templates)
- Leaving user files untouched
- Reporting what was installed

---

## Step 5 - Report the result

If install succeeded:

> "Update complete. Here's what was installed:
>
> - [list of files updated]
>
> A backup of your previous files was saved to [backup location from script output]. Your personal files were not touched.
>
> If anything feels broken after the update, let me know and we can roll back."

If install failed partway:

> "Update partially failed. [N] files were updated successfully, but [M] failed: [list]. Your previous files are still backed up. Tell me the error and I'll help diagnose."

---

## Rules

- Never modify user-owned files. The list above is the contract.
- Always show the user what's changing before installing. Never auto-apply updates.
- If the update mechanism doesn't exist (no `scripts/update_system.sh`), tell the user and stop. Don't guess at how to update.
- After updating, suggest the user re-read CLAUDE.md if it changed, since rules may have shifted.
- Never use - (em dash). Use - instead.
- This skill ends when the update is complete. Don't chain into other workflows.
