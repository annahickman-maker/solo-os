# Solo OS - Setup

Local-only dashboard for solopreneurs. Three services, all running on your machine. The vault folder is the database.

## Pre-flight

You need:
- Node 20+ (`node -v`)
- The `claude` CLI on your PATH (for AI features) - run `claude auth login` once
- A vault folder to point at, OR use the bundled `sample-vault/`

## Quickstart (using the bundled sample vault)

```bash
cd ~/Desktop/dashboard-template
./start-local.sh
```

That installs nothing - assumes you've already run `npm install` in each subfolder. If you haven't:

```bash
(cd server && npm install) && (cd frontend && npm install) && (cd claude-bridge && npm install)
```

Then `./start-local.sh`. It boots three supervised services:

| Port | Service | What it does |
|---|---|---|
| 5174 | frontend | Vite + React dashboard UI |
| 8791 | server | Reads/writes vault files |
| 8789 | claude-bridge | Spawns `claude -p` for AI features |

Open http://localhost:5174 - password is `dev`.

## Pointing at a different vault

The default vault is `./sample-vault/` next to this file. To use your own:

```bash
VAULT_ROOT="/path/to/your/vault" ./start-local.sh
```

Or set it once in `server/.env`:

```
VAULT_ROOT=/path/to/your/vault
```

Your vault should follow the structure in `sample-vault/`:

```
00_System/          tasks, projects, goals, state.md, *.json data
01_Core/            6 core onboarding files (positioning, audience, etc.)
03_Projects/        skool-replies + active project files
04_Channel/         video projects + channel config
05_Assets/          POVs, Avatars, Proof, Transcripts
07_Products/        Gumroad inventory
08_Service/         client folders
```

You don't need every folder - the dashboard tolerates missing files. But the more you fill in, the more panels light up.

## Optional API keys

Set these in `server/.env` if you want the matching panels to pull live data:

```
YOUTUBE_API_KEY=AIza...
YOUTUBE_CHANNEL_HANDLE=@yourhandle
STRIPE_API_KEY=sk_live_...
INSTAGRAM_HANDLE=yourhandle
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_BUSINESS_ACCOUNT_ID=...
```

All of these are optional. Without them, the YouTube / Stripe / Instagram metrics panels return empty.

## Day-to-day

- Edit code under `server/src/**` → run `lsof -ti:8791 | xargs kill` to restart (supervisor picks it up in ~2s)
- Edit code under `frontend/src/**` → Vite HMR picks it up automatically
- Edit vault files → server reads fresh on each request, no restart needed
- Stop everything → Ctrl+C in the terminal running `start-local.sh`

## Logs

```
tail -f /tmp/solo-os-server.log
tail -f /tmp/solo-os-frontend.log
tail -f /tmp/solo-os-claude-bridge.log
```

## Troubleshooting

- **Password prompt won't accept "dev"** → wipe localStorage in browser devtools, refresh.
- **AI features return "fetch failed"** → claude-bridge isn't running, or `claude` isn't on PATH. Check `/tmp/solo-os-claude-bridge.log`.
- **Empty Today page** → vault path isn't set or doesn't contain a `00_System/state.md`. Check `server/.env`.
- **Port already in use** → another solo os instance is running, or your live dashboard is using the standard ports. The launcher kills stale processes on its own ports but won't touch other apps.
