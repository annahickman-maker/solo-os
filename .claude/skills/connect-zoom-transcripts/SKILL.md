---
name: connect-zoom-transcripts
description: 'Walk a dashboard user through connecting their Zoom account so cloud-recording transcripts automatically drop into their vault. Triggered by phrases like "connect Zoom to my dashboard", "set up Zoom transcripts", "I want my Zoom recordings to show up in my vault". Guides them through a one-time Zoom Marketplace Server-to-Server OAuth setup, captures their Account ID + Client ID + Client Secret, sends them to the local dashboard server which tests + saves them, then runs a first sync to confirm. All credentials stay on the user''s machine. Read this whole file before starting - the steps are linear and the user is doing manual UI work in a browser between every step.'
category: Create
hidden: true
---

# Connect Zoom transcripts to the dashboard

A one-time setup that wires the user's own Zoom Server-to-Server OAuth app into the dashboard so transcripts from new cloud recordings drop into their vault every 15 minutes automatically. The user owns their credentials; nothing is shared.

## Before you start

Confirm the dashboard is running. If they don't already see `http://localhost:5174` open in a tab, ask them to double-click `Solo OS.app` (or `./start-local.sh`) first and confirm the page loads.

The whole flow takes ~10 minutes for someone who has never used Zoom Marketplace. Tell them up front: "I'll walk you through 5 steps in your browser, ask you for three strings of text at the end, and then verify it works. Open a new tab so you can flip back and forth."

Do not try to automate the Zoom Marketplace steps - they are manual UI clicks the user has to do themselves. Your job is to give crystal-clear instructions one step at a time and wait for them to say "done" before moving to the next step.

Two prerequisites the user needs (ask before starting):
1. **A Zoom account with cloud recording enabled.** Free tier doesn't include cloud recording. They need Pro, Business, Education, or Enterprise.
2. **Admin or owner access to the Zoom account** (S2S OAuth apps can only be created by account admins).

If either is missing, stop here and tell them. They'll need to fix that before this skill can do anything useful.

## Step 1 - Create the Server-to-Server OAuth app

Ask the user to open https://marketplace.zoom.us/develop/create.

Tell them:
- Find the "Server-to-Server OAuth" card and click **Create**
- App name: anything, e.g. "Solo OS Dashboard"
- Click **Create** in the modal

They land on the new app's page. Five tabs run down the left side: App Credentials, Information, Feature, Scopes, Activation.

Wait for "done".

## Step 2 - Fill in the Information tab

On the left, click **Information**. Tell them to fill in (these are required for activation but mostly cosmetic - the app is private to their account):
- Short description: "Sync Zoom transcripts into my local dashboard vault" (anything works)
- Long description: same or anything
- Company name: their name or business name
- Developer contact name: their name
- Developer contact email: their email
- Click **Continue** at the bottom

Wait for "done".

## Step 3 - Add scopes

On the left, click **Scopes**. Click **+ Add Scopes**.

In the search box that opens, type `recording`. Two scopes need to be checked:

1. **View user's recordings** - exact label is `cloud_recording:read:list_user_recordings:admin`. If you don't see that one, the older equivalent is `recording:read:admin` - either works.
2. **View a recording** - exact label is `cloud_recording:read:recording:admin`. Older equivalent: also covered by `recording:read:admin`.

Tell them: "Tick both of those, click **Done**, then **Continue** at the bottom."

If they only see one scope under "recording" called just `recording:read:admin`, that one alone is enough - tick it and continue.

Wait for "done".

## Step 4 - Activate the app

On the left, click **Activation**. Click **Activate your app**.

If activation fails, the error message will say what's missing (usually a required Information field or scope). Walk them through fixing whatever it flagged.

Wait for "done" with a successful activation.

## Step 5 - Grab the three credentials

On the left, click **App Credentials**.

Tell them: "Three strings of text are listed here. Copy each one and paste it to me, labeled. I'll write them into the dashboard's local config."

The three strings (in this exact order):
- **Account ID** (looks like `abCdEfGhIj-kLmNoPqRsT`)
- **Client ID** (looks like `aBcDeFgHiJkLmNoPqRsTuV`)
- **Client Secret** (looks like a long random string, ~40+ chars)

Wait for all three. If they only paste some, ask for the missing ones by name.

## Step 6 - Send the credentials to the dashboard server

Once you have all three, POST them to the dashboard's zoom endpoint. The endpoint tests the credentials against Zoom BEFORE saving - if they're wrong, it returns 401 and nothing gets persisted.

```bash
curl -s -X POST -H "X-Dashboard-Password: dev" -H "content-type: application/json" \
  http://localhost:8791/api/zoom/credentials \
  -d '{"account_id":"<account_id>","client_id":"<client_id>","client_secret":"<client_secret>"}'
```

Expected response on success: `{"ok":true,"connected_at":<unix-seconds>}`.

If you see `{"ok":false,"error":"Zoom rejected the credentials: ..."}`, the most common causes:
- One of the three strings has a leading/trailing space (most common - especially after pasting).
- The app wasn't activated in step 4. Send them back to the Activation tab.
- The scopes from step 3 weren't saved. Send them back to the Scopes tab.

## Step 7 - Run a first sync

The dashboard auto-syncs every 15 minutes, but you can kick off the first sync now so the user immediately sees something work.

```bash
curl -s -X POST -H "X-Dashboard-Password: dev" http://localhost:8791/api/zoom/sync
```

Expected response: `{"ok":true,"saved":[...],"skipped_no_transcript":N,"skipped_already_processed":0,"error":null}`.

Tell the user what was saved. If `saved` is empty, explain: "No new recordings from the last 7 days had a finished transcript. Zoom takes 15-30 minutes after a meeting ends to process the transcript - and you need cloud recording on, not local recording. The next time you record a Zoom call, it'll auto-sync into your vault within 15 minutes."

Walk them to the vault folder so they know where to look:
- `~/Desktop/solo-os/sample-vault/05_Assets/Transcripts/` (or wherever their VAULT_ROOT points)
- Files named `zoom-YYYY-MM-DD_<topic-slug>.md`
- Each file has a frontmatter `call_type` field auto-set from the meeting topic - `qa`, `workshop`, `client`, or `untagged`. They can change this from the Vault page in the dashboard later.

## Step 8 - Verify status

Confirm the connection is persisted:

```bash
curl -s -H "X-Dashboard-Password: dev" http://localhost:8791/api/zoom/status
```

Expected: `{"connected":true,"connected_at":...,"account_id_preview":"<first 4 chars>…","last_sync_at":<unix>,"last_sync_count":N,...}`.

If that's what you see, tell the user: "Done. Zoom is connected. From now on, any new cloud recording with a finished transcript drops into `05_Assets/Transcripts/` automatically within 15 minutes of you closing the dashboard's running. You won't need to do this again."

## Failure modes and how to handle them

- **`/api/zoom/status` 404s.** The dashboard server isn't running. Ask the user to launch Solo OS and check `/tmp/solo-os-server.log` for errors.
- **`Zoom rejected the credentials: ... 401`.** The most common cause is one of the three strings has a leading/trailing space. Ask the user to paste them again, being careful with the copy. If that fails, send them back to App Credentials and have them regenerate the Client Secret (button on the same tab) - the OLD secret stops working immediately.
- **`saved` is always empty even days later.** They are recording LOCALLY, not to the cloud. Cloud recording is a per-account setting at https://zoom.us/account/recording - check the "Cloud recording" toggle.
- **Transcripts are blank.** Zoom transcript auto-generation is a separate setting. At https://zoom.us/account/recording, scroll to "Recording Transcript" or "Audio transcript" and enable it.
- **They want to stop the sync / disconnect.** `curl -s -X DELETE -H "X-Dashboard-Password: dev" http://localhost:8791/api/zoom/credentials`. This wipes `~/.solo-os/zoom-config.json` and `~/.solo-os/zoom-state.json`. The transcripts already in the vault stay.

## What gets stored where

- Credentials: `~/.solo-os/zoom-config.json` (mode 600 if your tool supports it - has secrets in it)
- Sync state (last-processed end_time): `~/.solo-os/zoom-state.json`
- Transcripts: `<VAULT>/05_Assets/Transcripts/zoom-YYYY-MM-DD_<topic-slug>.md`

Nothing is sent to a third-party server. The dashboard talks directly to Zoom from the user's machine using the credentials they pasted.
