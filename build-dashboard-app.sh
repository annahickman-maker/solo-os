#!/usr/bin/env bash
# build-dashboard-app.sh - assemble (or refresh) the "Solo OS.app" bundle.
#
# This is the piece that makes Solo OS SELF-CONTAINED and OFF iCLOUD. It takes
# a source checkout of the dashboard and installs the code INSIDE the app:
#
#   /Applications/Solo OS.app/Contents/Resources/app   <- the git repo lives here
#                                                          (code + node_modules + built frontend)
#
# Because the app bundle sits in /Applications (never iCloud-synced), the code,
# its git history, node_modules and builds are all off iCloud. The "update +
# restart" button's `git pull` runs in Resources/app. The member's VAULT is a
# SEPARATE folder (~/Desktop/Solo OS) that this script never touches.
#
# Usage:
#   ./build-dashboard-app.sh <SRC_DIR> [APP_BUNDLE]
#     SRC_DIR     a checkout of the repo to install (should contain .git so the
#                 update button can pull). Its node_modules/dist are ignored;
#                 deps are installed fresh inside the app.
#     APP_BUNDLE  target .app (default /Applications/Solo OS.app, or $APP_BUNDLE)
#
# Idempotent and safe to re-run: it wipes and rebuilds the app's CODE only.
# It never reads or writes the vault, so a rebuild/reinstall can never lose
# the member's data.

set -uo pipefail

SRC_DIR="${1:?usage: build-dashboard-app.sh <SRC_DIR> [APP_BUNDLE]}"
SRC_DIR="$(cd "$SRC_DIR" 2>/dev/null && pwd)" || { echo "✗ source dir not found: $1"; exit 1; }
APP_BUNDLE="${2:-${APP_BUNDLE:-/Applications/Solo OS.app}}"
CODE_DIR="$APP_BUNDLE/Contents/Resources/app"

echo ""
echo "Building Solo OS.app"
echo "===================="
echo "  source : $SRC_DIR"
echo "  app    : $APP_BUNDLE"
echo "  code   : $CODE_DIR"
echo ""

# ─── 1. Stop a prior instance of THIS app so we can swap its code ───────────
# Match by the code path (services + supervisor) and by the install ports, so
# other dashboard instances on the machine are left running.
echo "→ stopping any running copy of this app"
if [ -d "$CODE_DIR" ]; then
  pkill -f "$CODE_DIR/" 2>/dev/null || true
fi
for p in 5174 8791 8789; do
  pids=$(lsof -ti:"$p" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    # Only kill if the listener belongs to this code dir (avoid nuking a
    # different instance that happens to share a port).
    for pid in $pids; do
      cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep '^n' | sed 's/^n//')
      case "$cwd" in
        "$CODE_DIR"*) kill -9 "$pid" 2>/dev/null || true ;;
      esac
    done
  fi
done
sleep 1

# ─── 2. Preserve per-install secrets across the rebuild ─────────────────────
# server/.env holds optional API keys (YouTube/Stripe/Instagram). Don't make
# the member re-enter them on every reinstall. (The SS membership token lives
# at ~/.solo-os/membership.json, outside the app, so it already survives.)
SAVED_ENV=""
if [ -f "$CODE_DIR/server/.env" ]; then
  SAVED_ENV="$(mktemp)"
  cp "$CODE_DIR/server/.env" "$SAVED_ENV"
  echo "✓ preserved existing server/.env"
fi

# ─── 3. Lay down a clean copy of the code inside the app ────────────────────
echo "→ installing code into the app bundle"
rm -rf "$APP_BUNDLE"
mkdir -p "$CODE_DIR" "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"

# rsync the checkout in, INCLUDING .git (so the update button can pull) but
# excluding build/runtime artefacts - deps are installed fresh below.
rsync -a \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='**/dist/' \
  --exclude='.vite/' \
  --exclude='**/.vite/' \
  --exclude='*.tsbuildinfo' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  --exclude='server/.env' \
  --exclude='test-vault/' \
  "$SRC_DIR/" "$CODE_DIR/" || { echo "✗ copying code failed"; exit 1; }

# Restore preserved secrets.
if [ -n "$SAVED_ENV" ]; then
  cp "$SAVED_ENV" "$CODE_DIR/server/.env"
  rm -f "$SAVED_ENV"
fi

# ─── 4. Install dependencies + pre-build the frontend (inside the app) ──────
echo "→ installing dependencies (~1-2 min)"
install_one() { ( cd "$CODE_DIR/$1" && npm install --silent --no-audit --no-fund ) >/dev/null 2>&1; }

# Fast path: all three in parallel.
subs=(server frontend claude-bridge)
pids=()
for sub in "${subs[@]}"; do install_one "$sub" & pids+=($!); done
failed=()
i=0
for pid in "${pids[@]}"; do
  wait "$pid" || failed+=("${subs[$i]}")
  i=$((i+1))
done

# On a cold machine the three installs can race while they populate ~/.npm for
# the first time, and one fails. Retry any failures one at a time (reliable)
# before giving up - this is the difference between a smooth first install and
# a confusing error for a brand-new member.
if [ "${#failed[@]}" -gt 0 ]; then
  echo "  retrying ${failed[*]} sequentially..."
  for sub in "${failed[@]}"; do
    install_one "$sub" || { echo "✗ npm install failed in $sub. Check your internet connection and re-run."; exit 1; }
  done
fi
echo "✓ dependencies installed"

echo "→ pre-building the dashboard (for fast first open)"
( cd "$CODE_DIR/frontend" && npx vite build ) >/dev/null 2>&1 \
  && echo "✓ dashboard built" \
  || echo "⚠ build skipped (the launcher will build on first open instead)"

# ─── 5. App icon ────────────────────────────────────────────────────────────
if [ -f "$CODE_DIR/AppIcon.icns" ]; then
  cp "$CODE_DIR/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
else
  echo "⚠ AppIcon.icns not found in the repo; the app will use a default icon"
fi

# ─── 6. Info.plist ──────────────────────────────────────────────────────────
cat > "$APP_BUNDLE/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.solo-os.dashboard</string>
  <key>CFBundleName</key>
  <string>Solo OS</string>
  <key>CFBundleDisplayName</key>
  <string>Solo OS</string>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.2.0</string>
  <key>CFBundleVersion</key>
  <string>2</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>LSUIElement</key>
  <false/>
</dict>
</plist>
PLIST

# ─── 7. Launcher executable ─────────────────────────────────────────────────
# Runs when the user double-clicks the .app. Points at the code that now lives
# INSIDE the bundle (Resources/app), so start-local.sh and `git pull` all run
# off iCloud.
cat > "$APP_BUNDLE/Contents/MacOS/launcher" <<LAUNCHER
#!/bin/bash
# Solo OS launcher - generated by build-dashboard-app.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Code: $CODE_DIR

DASH_DIR="$CODE_DIR"
LOG_DIR="/tmp"

# Ensure node is findable when launched via Finder (no shell init). Pick the
# newest installed nvm version dynamically + cover both Homebrew prefixes.
# \$HOME/.local/bin is where the native Claude Code installer puts \`claude\` -
# without it the claude-bridge can't find the CLI and AI features fail.
NVM_BIN=""
if [ -d "\$HOME/.nvm/versions/node" ]; then
  NVM_BIN=\$(ls -d "\$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -1)
fi
export PATH="\${NVM_BIN:+\$NVM_BIN:}\$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"

# Already running? Just open the browser.
if lsof -ti:5174 >/dev/null 2>&1; then
  open -a "Google Chrome" http://localhost:5174 2>/dev/null || open http://localhost:5174
  exit 0
fi

# Start the supervised services in the background. Invoke through /bin/bash so
# macOS provenance (com.apple.provenance xattr) doesn't block exec from the
# bundle. Detach via nohup so the .app process exits cleanly.
nohup /bin/bash "\$DASH_DIR/start-local.sh" > "\$LOG_DIR/solo-os-launcher.log" 2>&1 &

# Wait up to 30s for the frontend, then open the browser.
for i in {1..30}; do
  if lsof -ti:5174 >/dev/null 2>&1; then
    sleep 1
    open -a "Google Chrome" http://localhost:5174 2>/dev/null || open http://localhost:5174
    exit 0
  fi
  sleep 1
done

osascript -e "display alert \"Solo OS\" message \"Services did not start in time. Check /tmp/solo-os-launcher.log\""
exit 1
LAUNCHER

chmod +x "$APP_BUNDLE/Contents/MacOS/launcher"

# Refresh the icon cache so the new icon shows.
touch "$APP_BUNDLE"

echo ""
echo "✓ Built $APP_BUNDLE"
echo "  code lives at: $CODE_DIR  (off iCloud, self-contained)"
echo ""
