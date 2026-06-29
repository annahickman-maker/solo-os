---
name: connect-google-calendar
hidden: true
description: Walk a dashboard user through connecting their Google Calendar so meetings appear on the Today page. Triggered by phrases like "connect my Google Calendar to the dashboard", "set up Google Calendar", "I want my meetings to show up here". Guides them through a one-time Google Cloud Console setup, captures their client ID + client secret, writes them to a local config file, restarts the dashboard server, and verifies the OAuth grant. All credentials stay on the user's machine. Read this whole file before starting - the steps are linear and the user is doing manual UI work in a browser between every step.
---

# Connect Google Calendar to the dashboard

A one-time setup that wires the user's own Google Cloud OAuth client into their local dashboard so today's meetings surface on the Today page. The user owns their credentials; nothing is shared.

## Before you start

Confirm with the user that the dashboard is running. If they don't already see `http://localhost:5173` open in a tab, ask them to double-click `dashboard.command` (or `./start-local.sh`) first and confirm the page loads.

The whole flow takes ~10 minutes for someone who has never used Google Cloud Console. Tell them up front: "I'll walk you through 5 steps in your browser, ask you for two strings of text at the end, and then verify it works. Open a new tab so you can flip back and forth."

Do not try to automate the Google Cloud Console steps - they are manual UI clicks the user has to do themselves. Your job is to give crystal-clear instructions one step at a time and wait for them to say "done" before moving to the next step.

## Step 1 - Create or pick a Google Cloud project

Ask the user to open https://console.cloud.google.com/projectcreate.

Tell them:
- Project name: anything, e.g. "Dashboard Local"
- Organization / location: leave default
- Click CREATE
- Wait ~10 seconds for the project to provision, then make sure it's selected in the top-left project picker

Wait for "done".

## Step 2 - Enable the Google Calendar API

Ask them to open https://console.cloud.google.com/apis/library/calendar-json.googleapis.com and click the blue ENABLE button. Wait for it to finish (5-15 seconds).

Wait for "done".

## Step 3 - Configure the OAuth consent screen

Ask them to open https://console.cloud.google.com/apis/credentials/consent.

Walk them through it:
- User Type: External -> CREATE
- App information:
  - App name: anything, e.g. "My Dashboard"
  - User support email: their own email
  - Developer contact email: their own email (at the very bottom)
- SAVE AND CONTINUE
- Scopes: click ADD OR REMOVE SCOPES, search "calendar", check the box next to `.../auth/calendar.readonly` (description: "See and download any calendar..."), UPDATE, SAVE AND CONTINUE
- Test users: ADD USERS, enter their own email, ADD, SAVE AND CONTINUE
- Summary: BACK TO DASHBOARD

This whole step is the slowest. Be patient and explicit about each click.

Wait for "done".

## Step 4 - Create the OAuth client ID

Ask them to open https://console.cloud.google.com/apis/credentials.

- Click + CREATE CREDENTIALS at the top -> OAuth client ID
- Application type: **Desktop app** (this matters - Web app would require a different redirect URI configuration)
- Name: anything, e.g. "Dashboard"
- CREATE

A modal will pop up with TWO strings:
- Client ID (looks like `123456789012-abc...xyz.apps.googleusercontent.com`)
- Client secret (looks like `GOCSPX-abc...xyz`)

Tell them: "Copy both of these and paste them to me. I'll write them into your local config and they never leave this machine."

Wait for them to paste both. If they only paste one, ask for the other.

## Step 5 - Write the config and restart the server

Once you have both strings, use the Write tool (or Bash + heredoc) to create `00_System/.google-config.json` at the vault root. Resolve "vault root" as the parent directory of `03_Projects/dashboard/` (where this skill lives).

The file shape is exactly:

```json
{
  "client_id": "<their client ID>",
  "client_secret": "<their client secret>",
  "redirect_uri": "http://localhost:8790/api/google/callback"
}
```

Use file mode 0600 if your tool supports it (the config has a secret in it).

Then restart the dashboard server so it picks up the new config:

```bash
lsof -ti:8790 | xargs kill
```

The dashboard supervisor brings the server back automatically within 2 seconds.

Verify the server sees the credentials:

```bash
sleep 3
curl -s -H "X-Dashboard-Password: dev" http://localhost:8790/api/google/status
```

Expected response: `{"configured":true,"connected":false,"email":null}`.

If `configured` is still `false`, something went wrong - check that the config file was written to the right path and that the server actually restarted.

## Step 6 - Grant the OAuth permission

Tell the user: "Refresh the dashboard tab. The 'run this prompt in Claude' panel should now be replaced by a 'connect calendar' button. Click it."

That button takes them to Google's consent screen. They'll see an "unverified app" warning - that's expected and safe because they're consenting to their own OAuth client. They click "Advanced" -> "Go to {app name} (unsafe)" -> select their Google account -> click "Allow" on the calendar.readonly scope.

Google redirects back to the dashboard with `?google=connected` in the URL. The Today page now shows today's meetings.

Verify with:

```bash
curl -s -H "X-Dashboard-Password: dev" http://localhost:8790/api/google/status
```

Expected: `{"configured":true,"connected":true,"email":"<their email>"}`.

If that's what you see, tell the user: "Done. Your calendar is connected. You won't need to do this again - the dashboard refreshes the access token automatically. The only reason you'd ever redo this is if you revoke access in your Google account settings."

## Failure modes and how to handle them

- **`/api/google/status` 404s.** The dashboard server isn't running. Ask the user to double-click `dashboard.command` again and check `/tmp/dashboard-server.log` for errors.
- **"redirect_uri_mismatch" from Google.** The Desktop app type was not used in step 4 - they likely picked Web app instead. The fix is to delete that OAuth client in https://console.cloud.google.com/apis/credentials and redo step 4 with type Desktop app.
- **"access blocked: this app's request is invalid".** They didn't add their email as a test user in step 3. Send them back to https://console.cloud.google.com/apis/credentials/consent -> Test users -> ADD USERS.
- **`configured: true, connected: false` after they clicked Allow.** Either they hit Cancel instead of Allow, or the state param expired (>10 min between connect-url and callback). Ask them to click connect calendar again.
- **They pasted the wrong strings.** A client ID always ends in `.apps.googleusercontent.com`. A client secret always starts with `GOCSPX-`. Validate before writing the config.

## What you do NOT do

- Don't ask for or store the user's Google password - the OAuth grant happens in their browser with Google directly.
- Don't try to use the Google Calendar API yourself - the dashboard server does that, with tokens stored at `00_System/.google-tokens.json` (also mode 0600, also gitignored).
- Don't share the user's client secret in chat output, logs, or commit messages. Treat it like a password.
