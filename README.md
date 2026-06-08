# Solo OS

A local-only operating dashboard for solopreneurs. Reads and writes a vault folder of markdown + JSON files. Three services on your machine, no cloud.

```
:5174  frontend       Vite + React UI
:8791  server         Hono - reads/writes vault files
:8789  claude-bridge  spawns `claude -p` for AI features
```

## Install

```bash
git clone <this-repo> ~/Desktop/solo-os
cd ~/Desktop/solo-os
(cd server && npm install) && (cd frontend && npm install) && (cd claude-bridge && npm install)
./start-local.sh
```

Open http://localhost:5174 - password is `dev`. You'll land on the example data in `sample-vault/`.

## Point at your own vault

```bash
VAULT_ROOT="/path/to/your/vault" ./start-local.sh
```

Or set it once in `server/.env`:

```
VAULT_ROOT=/path/to/your/vault
```

Your vault should follow the structure in `sample-vault/`. See [DEPLOY.md](DEPLOY.md) for the full setup guide.

## Updating

When the maintainer publishes changes:

```bash
git pull
```

Your vault (outside this repo) is never touched. If you set `VAULT_ROOT` to a folder inside the repo, that's on you - prefer keeping it outside.

## What's in here

```
server/         Hono backend that reads/writes the vault
frontend/       Vite + React dashboard UI
claude-bridge/  Tiny HTTP service that spawns `claude -p`
sample-vault/   Example vault - default VAULT_ROOT
spec/           Historical SPEC (out of date - see CLAUDE.md for actual)
start-local.sh  Supervised launcher for all three services
CLAUDE.md       Guide for AI coding assistants
DEPLOY.md       Setup guide
```
