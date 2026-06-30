#!/bin/bash
# Solo OS manual setup. Run this once from a cloned copy of the repo:
#
#   git clone https://github.com/annahickman-maker/solo-os.git ~/solo-os-src
#   cd ~/solo-os-src
#   ./setup.sh
#
# What it does:
#   1. Seeds your VAULT at ~/Desktop/Solo OS on first run (never overwrites it).
#   2. Installs the CODE inside /Applications/Solo OS.app (self-contained, off
#      iCloud) and builds the launcher - via build-dashboard-app.sh.
#
# After this, the code lives in the app. The folder you cloned into is just a
# staging copy; you can delete it. Launch from /Applications/Solo OS (or ⌘-space
# "Solo OS"). Updates happen in-app via Settings -> "update + restart".
#
# Most people should use the one-line installer instead:
#   curl -fsSL https://raw.githubusercontent.com/annahickman-maker/solo-os/main/install.sh | bash

set -e

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_BUNDLE="${APP_BUNDLE:-/Applications/Solo OS.app}"
VAULT_DIR="${VAULT_DIR:-$HOME/Desktop/Solo OS}"

echo ""
echo "Solo OS setup"
echo "============="
echo ""
echo "  source : $SRC_DIR"
echo "  app    : $APP_BUNDLE"
echo "  vault  : $VAULT_DIR"
echo ""

# ─── 1. Check the claude CLI (best effort) ─────────────────────────────────
if ! command -v claude >/dev/null 2>&1; then
  echo "⚠  The 'claude' CLI is not installed."
  echo "   The dashboard uses your Claude Code subscription for AI features."
  echo "   Install it from https://claude.com/code, run 'claude auth login', then re-run ./setup.sh."
  echo ""
else
  echo "✓ Found 'claude' at $(command -v claude)"
  echo "  (If you haven't run 'claude auth login' yet, do that for AI features.)"
  echo ""
fi

# ─── 2. Seed the vault (first run only) ────────────────────────────────────
if [ -e "$VAULT_DIR" ]; then
  echo "✓ Vault already exists at $VAULT_DIR - leaving it untouched."
else
  if [ -d "$SRC_DIR/sample-vault" ]; then
    mkdir -p "$(dirname "$VAULT_DIR")"
    cp -R "$SRC_DIR/sample-vault" "$VAULT_DIR"
    echo "✓ Created your vault at $VAULT_DIR (seeded with the starter files)."
  else
    mkdir -p "$VAULT_DIR/01_Core"
    echo "⚠ No starter vault found; created an empty vault at $VAULT_DIR."
  fi
fi
echo ""

# ─── 3. Build the app (installs code into /Applications/Solo OS.app) ────────
APP_BUNDLE="$APP_BUNDLE" bash "$SRC_DIR/build-dashboard-app.sh" "$SRC_DIR" "$APP_BUNDLE"

# ─── 4. Done ───────────────────────────────────────────────────────────────
echo "─────────────────────────────────────────────"
echo ""
echo "  ✓ Solo OS is installed."
echo ""
echo "  → Open it from /Applications/Solo OS (or ⌘-Space, 'Solo OS')"
echo "  → Dashboard: http://localhost:5174   (password: dev)"
echo "  → Your vault: $VAULT_DIR"
echo ""
echo "  The code now lives inside the app. This cloned folder is just a"
echo "  staging copy - you can delete it. Updates happen in-app via"
echo "  Settings -> 'update + restart'."
echo ""
echo "─────────────────────────────────────────────"
echo ""
