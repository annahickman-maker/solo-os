---
name: setup-conversion-tracking
description: One-time setup that turns on the conversion tracking system for the dashboard's offer pages. Deploys a free Cloudflare Worker that handles /go/<slug> short links, counts clicks, and feeds real conversion data back into each offer's Conversions section. Use when the user says "set up conversion tracking", "set up tracking links", "set up the tracking system", or when the dashboard shows "tracking system not set up" on an offer.
---

# Setup - Conversion Tracking

One-time setup. Deploys a Cloudflare Worker that serves `/go/<slug>` short links from a small JSON manifest stored in your vault. Every click is counted in Cloudflare's KV storage. The dashboard reads aggregated click counts from the worker to fill in real conversion data on your offer pages.

After this skill finishes:
- A Cloudflare Worker is deployed and running
- The dashboard's offer pages stop showing "tracking system not set up"
- The "Generate tracking link" button works on every offer
- Click counts feed back into the Conversions section automatically

---

## Preflight

1. Check whether tracking is already set up by looking for `03_Projects/agents/worker/wrangler.toml` AND `scripts/link_manifest.json`. If both exist and the user can answer "yes" to "is `wrangler deploy` already working?", STOP: "Conversion tracking is already set up. Want to reconfigure (point at a different domain), or quit?"

2. Confirm the worker template exists at `03_Projects/agents/worker/` in the user's vault. If missing, scaffold from the bundled template (see "Scaffolding the worker" at the bottom of this skill).

---

## Welcome

> "This sets up your conversion tracking system. Once it's running, every offer in your dashboard can generate short links (your-domain.com/go/something) that count clicks and feed real conversion data back to your offer page.
>
> The system runs on a free Cloudflare Worker - your own URL, your own data, no third-party redirect service skimming your traffic.
>
> The setup takes about 15 minutes. You'll need a Cloudflare account (free) and either your own domain or willingness to use the workers.dev default URL.
>
> Ready?"

Wait for confirmation.

---

## Rules for the walkthrough

- One step at a time. Never show the next step until the current is confirmed complete.
- For each step, if the user reports a screen that doesn't match your description, ask them to paste what they see. Don't guess.
- If `wrangler` errors during deploy, troubleshoot before moving on. The most common errors have known causes (see "Common errors" below).

---

## Step 1 - Decide on the URL pattern

> "First decision: where do your tracking links live?
>
> **Option A - Your own domain** (recommended)
> Links look like `yourdomain.com/go/<slug>`. Cleaner, brand-owned, harder to break.
> Requires: your domain on Cloudflare. If it's not already, you'll need to move DNS over (about 10 minutes).
>
> **Option B - Cloudflare's free workers.dev subdomain**
> Links look like `your-worker-name.your-account.workers.dev/go/<slug>`. Ugly but free and instant.
> Good for: testing the system before committing to a domain.
>
> Which do you want?"

Save their choice. If A, ask them for the domain name. If B, just continue.

STOP - confirm before continuing.

---

## Step 2 - Create a Cloudflare account (if they don't have one)

> "Open https://dash.cloudflare.com and sign in (or sign up - it's free).
>
> If you chose your own domain in step 1: in the Cloudflare dashboard, you should already see your domain listed. If not, click 'Add a site', paste your domain, follow Cloudflare's prompts to move DNS over. This takes about 10 minutes including DNS propagation. Come back here when your domain shows as 'Active' in the Cloudflare dashboard.
>
> If you chose workers.dev: nothing to do. Continue."

STOP - wait until the user confirms either (a) their domain is active in Cloudflare or (b) they're using workers.dev.

---

## Step 3 - Install Wrangler

Wrangler is Cloudflare's CLI for deploying Workers. The dashboard's installer already installed Node, so wrangler is one command away.

> "Open Terminal, then run:
>
> ```
> npm install -g wrangler
> ```
>
> When it finishes, run:
>
> ```
> wrangler login
> ```
>
> This opens your browser. Click 'Allow' to authorize Wrangler to deploy to your Cloudflare account. Come back here when you see 'Successfully logged in.'"

STOP - wait for confirmation.

---

## Step 4 - Configure the worker

Open `03_Projects/agents/worker/wrangler.toml` in their vault. It contains placeholders that need their info.

Required edits:

- `name = "solo-os-tracking"` - the worker's name. Already filled in.
- `compatibility_date = "..."` - already set; leave as is.

If they chose their own domain (Option A):

```toml
routes = [
  { pattern = "yourdomain.com/go/*", zone_name = "yourdomain.com" },
  { pattern = "yourdomain.com/link-stats", zone_name = "yourdomain.com" },
]
```

Replace `yourdomain.com` with their actual domain (in both places).

If they chose workers.dev (Option B):

Comment out the `routes` block (leave it as comments for later). The worker will auto-publish to `solo-os-tracking.<their-account>.workers.dev` by default.

For both options, the KV namespace block needs to be created. Tell the user:

> "We need to create a tiny piece of storage where Cloudflare keeps your click counts. In Terminal, from your vault folder, run:
>
> ```
> cd 03_Projects/agents/worker
> wrangler kv namespace create LINK_CLICKS
> ```
>
> Cloudflare gives you back an `id = "..."`. Paste that ID where the wrangler.toml file says `# PASTE_KV_ID_HERE`."

After they edit the file, save it and continue.

STOP - confirm wrangler.toml is fully filled out.

---

## Step 5 - Install dependencies and deploy

> "From `03_Projects/agents/worker/` in your terminal, run:
>
> ```
> npm install
> npm run deploy
> ```
>
> The first time, this takes about a minute. When it finishes, you'll see something like:
>
> ```
> Published solo-os-tracking
>   https://solo-os-tracking.<your-account>.workers.dev
> ```
>
> Or, if you set up your own domain, you'll see the route(s) it bound to.
>
> Paste me what you see when it finishes."

STOP - wait for the output. Confirm the deploy succeeded.

If they hit errors, see "Common errors" below.

---

## Step 6 - Test the redirect

Add a test entry to `scripts/link_manifest.json` (in their vault):

```json
{
  "_meta": { "version": 1 },
  "test": {
    "destination": "https://example.com",
    "source": "setup-test",
    "created": "[today's date]"
  }
}
```

Then redeploy:

```
cd 03_Projects/agents/worker
npm run deploy
```

> "Now visit your tracking URL with `/go/test` on the end. Either:
>
> - yourdomain.com/go/test (if you set up your own domain)
> - https://solo-os-tracking.<your-account>.workers.dev/go/test (if you're on workers.dev)
>
> You should be redirected to example.com. If you are, the system works."

STOP - wait for confirmation.

---

## Step 7 - Wire it to the dashboard

The dashboard checks for the worker by looking at two paths in the vault:
- `03_Projects/agents/worker/` exists
- `scripts/link_manifest.json` exists

Both should now exist. To verify the dashboard sees it, tell the user:

> "Open the dashboard. Go to Profile → Offer. Pick any offer with a VSL. Scroll to the Conversions section.
>
> Before this setup, you saw 'tracking system not set up' with a setup prompt. Now you should see a 'Generate tracking link' button instead.
>
> Click it. The dashboard should mint a new `/go/<slug>` for that VSL, write it to the manifest, and redeploy the worker.
>
> Tell me if it worked."

STOP - wait for confirmation. If the dashboard still shows "not set up", the dashboard may have cached the status. Tell them to refresh the page.

---

## Step 8 - Confirm and close

> "Conversion tracking is live. From here:
>
> - Every offer can mint short links by clicking 'Generate tracking link' on its VSL or short-form blocks
> - Every click is counted automatically in Cloudflare KV
> - Your Conversions section on each offer pulls click counts back in within about 5 minutes of each click
> - Your offer's Overall Score now reflects real conversion data instead of being marked as 'no data yet'
>
> The whole system stays on your machine and in your Cloudflare account. No third party touches your link traffic."

---

## Common errors

**`Error: Authentication error [code: 10000]` on deploy**
The user isn't logged into wrangler. Re-run `wrangler login`.

**`Error: There was an error in your request to the API. [10043] Could not route to zone, perhaps it doesn't exist?`**
The domain in `routes` isn't on this Cloudflare account. Either move the domain to Cloudflare first, or switch to workers.dev (comment out the routes block).

**`Error: KV namespace 'LINK_CLICKS' is required but not found`**
Step 4's `wrangler kv namespace create LINK_CLICKS` either didn't run or the returned ID wasn't pasted into wrangler.toml. Re-run the command, paste the ID.

**`/go/test` returns 404 even after deploy succeeds**
- For workers.dev: check the user is hitting `https://solo-os-tracking.<account>.workers.dev/go/test`, not their plain root domain
- For custom domain: DNS may not have propagated yet. Wait 5-10 minutes and try again

---

## Scaffolding the worker (if missing)

If `03_Projects/agents/worker/` doesn't exist in the user's vault when this skill starts, you need to scaffold it.

The minimal worker template lives in the Solopreneur OS template repo at `sample-vault/03_Projects/agents/worker/`. Copy those files into the user's vault at the same relative path:

- `src/index.ts` - the worker entry point
- `package.json` - dependencies + scripts
- `wrangler.toml` - the config the user will edit in Step 4
- `tsconfig.json` - TypeScript config
- `README.md` - explanation of what's in the folder

Then continue with Step 1.
