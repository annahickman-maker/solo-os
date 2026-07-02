# Solo OS desktop shell (maintainer notes)

The `desktop/` folder turns the dashboard into a packaged app (mac DMG,
Windows installer). Members download one file and never touch Node, npm, git,
or the claude CLI - everything ships inside the app.

## How it fits together

```
Solo OS.app/Contents/Resources/
├── app.asar                 <- desktop/main.cjs (the Electron main process)
├── server-bundles/          <- server.mjs + bridge.mjs (esbuild bundles of
│                               server/src/index.ts + claude-bridge/server.ts)
├── frontend/                <- the built React frontend (vite build)
├── claude/claude.exe        <- the NATIVE claude binary from
│                               @anthropic-ai/claude-code (yes, .exe on mac too)
├── app-skills/              <- the shipped skill pack (copy of .claude/skills)
└── sample-vault/            <- seeds a member's vault on first run
```

At runtime `main.cjs`:
1. finds or creates the vault (default `~/Desktop/Solo OS`, adopts an existing
   one, seeds from sample-vault, warns on iCloud paths)
2. picks a STABLE port (persisted in config - the origin holds localStorage,
   so the port must not change between launches), binds 127.0.0.1 only
3. runs server + bridge as utilityProcess children on Electron's bundled Node
   with env: `VAULT_ROOT`, `FRONTEND_DIST`, `SKILL_ROOTS_JSON`,
   `CLAUDE_BUNDLED_CLI`, `CLAUDE_BRIDGE_URL`, `SOLO_OS_DESKTOP=1`
4. supervises them (crash -> restart with backoff -> error screen with logs)
5. loads the window from `http://127.0.0.1:<port>/` - the server serves the
   frontend itself (FRONTEND_DIST), so it is all one origin, no proxy
6. handles auto-update (electron-updater against GitHub releases; the Settings
   "update + restart" button routes here via a parentPort message). Updates
   are MEMBERSHIP-GATED: the shell asks the server's membership state machine
   (with a silent recheck) before any check, falling back to the cached token
   at ~/.solo-os/membership.json when the server is unreachable - lapsed keys
   pause releases, same as the old git-pull button
7. keeps running in the background when the window closes (default ON, config
   `keepRunningInBackground`) so scheduled skills and Zoom sync keep firing -
   a tray icon reopens the dashboard or quits fully; Cmd+Q always fully quits
7. checks claude auth at boot and walks the member through a one-time
   terminal sign-in if needed

The same server/bridge source runs the web install unchanged - every desktop
behaviour is gated on an env var (`FRONTEND_DIST`, `SOLO_OS_DESKTOP`,
`CLAUDE_BUNDLED_CLI`, `SKILL_ROOTS_JSON`, `HOST`) that web installs never set.

## Build + release

Local:
```bash
npm ci && npm --prefix server ci && npm --prefix frontend ci
npm run desktop:selftest       # headless boot + API/skills/bridge assertions
npm run desktop:pack           # unpacked .app in desktop/release/ (fast)
npm run desktop:dist           # real DMG/installer
```

Release: bump `version` in package.json, commit, tag `v<version>`, push the
tag. `.github/workflows/desktop-release.yml` builds mac (arm64 + x64) and
Windows, runs the packaged self-test, and uploads everything to a DRAFT GitHub
release. Review the draft, click Publish - members' apps only ever see
published releases.

Signing is controlled by repo secrets (see the workflow header). Without them
you get working unsigned builds: fine for testing, but members will fight
Gatekeeper/SmartScreen - configure the secrets before a real release.

## Traps

- The claude binary in node_modules is a HARDLINK into the platform package,
  and electron-builder's module collector drops it - that is why it ships as
  an extraResource (`claude/claude.exe`), not via node_modules.
- Cross-arch builds (arm64 mac building the x64 dmg) would ship the wrong
  claude binary; `desktop/afterPack.cjs` downloads and swaps the right one.
- `utilityProcess` env values must all be strings - an `undefined` value
  throws "Invalid value for env".
- The bundled claude must run with `DISABLE_AUTOUPDATER=1` - it lives inside
  a (signed) app bundle and must not try to rewrite itself.
- The self-test asserts the bridge resolved the BUNDLED binary when packaged.
  A pass that leans on the build machine's own claude install is a fail.
