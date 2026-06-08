# Sync workflow

The flow:

```
Your live dashboard                 →   Template (this repo)        →   Client installs
~/Desktop/Business/                     ~/Desktop/dashboard-template/   wherever they clone it
  03_Projects/dashboard/                                                (e.g. Tharros)

   you edit here          --run-->     git commit + push                git pull
   sync-to-template.sh                 to GitHub                        their vault untouched
```

Three steps for any code change you want to publish.

## 1. Edit in your live dashboard

Make changes the way you always have. Test them. When the change is ready to share with clients:

## 2. Push the change to the template

From the live dashboard folder:

```bash
cd ~/Desktop/Business/03_Projects/dashboard
./sync-to-template.sh
```

This rsyncs code-only changes into `~/Desktop/dashboard-template/`. The sync excludes:

- `node_modules/`, `dist/`, `.env`, logs - obvious
- `sample-vault/` - template's example data, never touched
- A small list of **template-owned files** that have structural differences (env-driven vault path, generic AI prompts, "Solo OS" brand). These live ONLY in the template.

If you change a template-owned file (e.g. `server/src/lib/titleGen.ts`), you'll need to port that change into the template by hand. The sync script tells you exactly which files are excluded.

After the rsync, the script applies a personal-reference scrub: `Anna Hickman` → `the creator`, `@theannahickman` → `the channel`, hardcoded Skool URLs blanked, etc. Idempotent - safe to run twice.

## 3. Commit + push to GitHub

```bash
cd ~/Desktop/dashboard-template
git status              # review what changed
git diff                # inspect specific files
git add -A
git commit -m "what changed"
git push
```

Clients can now `git pull` to receive the update.

## Setting up the GitHub repo (one-time)

You don't have `gh` installed locally, so do this through the GitHub web UI:

1. Go to https://github.com/new
2. Repo name: `solo-os` (or whatever you want)
3. Private. No README, no .gitignore, no license (we already have those locally).
4. Create.
5. GitHub gives you a remote URL. Then locally:

```bash
cd ~/Desktop/dashboard-template
git remote add origin git@github.com:YOUR_USERNAME/solo-os.git
git push -u origin main
```

You only do this once. After that, `git push` is enough.

## Installing for a new client (e.g. Tharros)

On Tharros's machine:

```bash
git clone git@github.com:YOUR_USERNAME/solo-os.git ~/Desktop/solo-os
cd ~/Desktop/solo-os
(cd server && npm install) && (cd frontend && npm install) && (cd claude-bridge && npm install)
```

Set his vault location (one-time):

```bash
echo "VAULT_ROOT=/Users/Tharros/path/to/his-vault" > server/.env
```

Run:

```bash
./start-local.sh
```

Done. Open http://localhost:5174 with password `dev`.

His vault folder lives outside this repo. Updates from you (`git pull`) never touch his vault data - only the code.

## Updating an existing client install

On the client's machine:

```bash
cd ~/Desktop/solo-os
git pull
(cd server && npm install) && (cd frontend && npm install)   # if deps changed
./start-local.sh
```

If they have local code edits and a `git pull` would conflict, that's their problem to resolve - it's a normal git workflow.

## Template-owned files (won't sync from your live dashboard)

These have structural differences in the template and must be edited directly in the template:

| File | Why it differs |
|---|---|
| `server/src/vault.ts` | `VAULT_ROOT` defaults to `./sample-vault/` (not your vault) |
| `server/src/routes/skills.ts` | `SKILL_ROOTS` env-driven, defaults to vault's `.claude/skills` |
| `server/src/routes/settings.ts` | Default CTA URLs blank (not your Skool link) |
| `server/src/lib/titleGen.ts` | Positioning reads from `state.md` slots (not hardcoded) |
| `server/src/lib/youtubeScriptBuilder.ts` | AI prompts say "the creator" not "Anna" |
| `frontend/index.html` | Title: `Solo OS` |
| `frontend/src/components/NavRail.tsx` | Brand text: `solo os` |
| `frontend/src/auth.tsx` | Password gate brand: `solo os.` |
| `frontend/src/pages/Today.tsx` | Greeting: `hello` (not `hello, anna`) |
| `frontend/vite.config.ts` | Ports 5174/8791 to avoid colliding with your live dashboard |
| `start-local.sh` | Template-specific paths, log names, port numbers |
| `claude-bridge/server.ts` | Default `CLAUDE_BIN` is `claude` (not your absolute path) |
| `CLAUDE.md`, `DEPLOY.md`, `README.md` | Template docs |
| `.claude/` | Template skill/launch configs |

If you find yourself porting the same edit from live → template repeatedly, that's a signal to refactor the file so it's env-driven and can sync. The long-term goal: shrink the template-owned list to zero.

## Future: reduce template overrides

Right now the brand and personal references are hardcoded in your live dashboard. The cleanest version would env-drive everything:

- `OWNER_NAME` → renders in `hello, {ownerName}` greeting (blank → `hello`)
- `BRAND_NAME` → renders in NavRail / auth gate (default → `solo os`)
- `CHANNEL_HANDLE` → AI prompts pull the handle from env

When you next refactor those files, set them up to read from env so you can delete entries from the template-owned list and sync stops needing to skip them.
