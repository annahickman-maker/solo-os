# Solo OS - Template

This is the template/generic version of the dashboard. It's a clean copy of a working personal dashboard, stripped of one user's data and rebranded as Solo OS. Use it to seed a new user/client install, then customize from there.

The dashboard runs LOCAL ONLY. There's no deployed/cloud version. Three services on the user's machine, vault folder as the database, no auth beyond a single password gate.

URL: http://localhost:5174 (password: `dev`)

## Architecture

```
:5174  frontend       Vite + React + TS SPA              (HMR on)
:8791  server         Hono + tsx + native fetch          (NO watch - restart on edit)
:8789  claude-bridge  spawns `claude -p` for AI features (no watch needed)
```

Each service is supervised in `start-local.sh` - if it crashes, the loop restarts it in ~2s.

## The vault

`VAULT_ROOT` env var. Defaults to `./sample-vault/` (bundled). The server reads/writes that folder directly - there's no database.

Files the server expects (folders are tolerated if absent):

- `00_System/state.md` - aggregate metrics + onboarding slots
- `00_System/master-todo.md` - human-readable task index
- `00_System/tasks/*.md` - one file per task
- `00_System/projects/*.md` - one file per project
- `00_System/goals/*.md` - 90-day focus goal + sub-goals
- `00_System/{wins,extracted-quotes,instagram-queue,...}.json` - JSON data buckets
- `00_System/deep-work/blocks.jsonl` - deep work session log
- `01_Core/core_*.md` - 6 onboarding files (positioning, audience, story, IP, offer-suite, voice-style)
- `04_Channel/04_Projects/project_*.md` - video projects (drives the Content page)
- `05_Assets/POVs/*.md` - point-of-view notes (raw material for AI features)
- `05_Assets/Avatars/*.md` - audience avatars
- `05_Assets/Proof/asset_proof.md` - brag bank
- `05_Assets/Transcripts/**/*.md` - call/workshop transcripts
- `07_Products/Gumroad/products/*.md` - product inventory
- `08_Service/clients/<Name>/_client.md` - client engagements
- `.claude/skills/*/SKILL.md` - vault-local skills (optional)

## The reload rule

| Edit location | What to do |
|---|---|
| `frontend/src/**` | Nothing - Vite HMR picks it up. Refresh browser if needed. |
| `server/src/**` | **Restart the server.** Run: `lsof -ti:8791 \| xargs kill` - supervisor auto-restarts within 2s. |
| `claude-bridge/**` | Restart the bridge: `lsof -ti:8789 \| xargs kill`. |
| Vault file (.md / .json) | Nothing - server reads fresh on each request. |

After editing server code, tell the user to restart the server (or do it). Don't just say "done" - they'll refresh and see no change.

## Frontend pages

| Route | Page |
|---|---|
| `/` | Today.tsx - greeting + top tasks + focus rings |
| `/focus` | Focus.tsx - 90-day goal + sub-goals + tasks |
| `/projects`, `/pipeline` | Projects.tsx |
| `/content` | Content.tsx - YouTube pipeline + Instagram queue |
| `/inbox` | Inbox.tsx - skool replies, transcripts, generic inbox |
| `/voice` | Voice.tsx - brainstorm answers, voice patterns |
| `/profile`, `/profile/reputation`, `/profile/offer`, `/brand`, `/offers` | Profile.tsx (Offer/Reputation/Brand router) |
| `/skills` | Skills.tsx |
| `/vault`, `/archive` | Archive.tsx |
| `/settings` | Settings.tsx |

## Server routes

`server/src/routes/`: tasks, projects, clients, goals, products, povs, videos, inbox, youtube, today, focus, pipeline, ssModules, settings, metrics, skills, profile, deepWork, reputation, thisWeek, archive, brainstorm, stripe, offers, seed, extracts, audienceQuotes, instagram.

## Server lib

Pure logic, no HTTP concerns:

- `offersPage.ts` - offer suite data, validation phases, sales-page/VSL config
- `reputationPage.ts` - reputation/avatar payload
- `avatarSynthesis.ts` - avatar building
- `audienceQuotes.ts`, `extractQuotes.ts`, `extractFromCore.ts` - quote mining from transcripts
- `brainstormSeed.ts` - voice brainstorm questions
- `contentAnalysis.ts`, `offerAnalysis.ts` - Claude analysis
- `instagramSync.ts` - IG queue sync
- `titleGen.ts`, `videoDescription.ts`, `youtubeScriptBuilder.ts`, `youtube.ts` - YouTube features

Most AI prompts in `server/src/lib/*.ts` read positioning from `state.md` slots (populated via onboarding). If slots are empty, they fall back to generic prompts.

## What the dashboard does (mental model)

Every panel either:

1. **Reads** a vault file and renders it
2. **Mutates** a vault file when the user ticks / edits something
3. **Triggers** a Claude call via `claude-bridge` for AI features

The dashboard is NOT a separate datastore. The vault is the database. The dashboard is a UI over it.

## Customizing this template per-user

For each new user/client install:

1. Copy the whole `dashboard-template/` folder somewhere fresh
2. Point `VAULT_ROOT` at their vault folder (or copy the sample-vault structure into it and edit)
3. Have them complete the onboarding flow on the Profile page - that populates `state.md` slots which drive AI prompts and most page chrome
4. Optionally edit `server/src/lib/titleGen.ts` and other AI prompt files for their specific tone if the slot-driven approach isn't enough

## What NOT to do

- Don't reference `SPEC.md` for current architecture - it describes an old Cloudflare/D1 plan, not what's actually here
- Don't change `start-local.sh` to use `npm run dev` (watch mode) - the current setup is deliberate
- Don't reintroduce hardcoded vault paths - everything goes through `VAULT_ROOT`
