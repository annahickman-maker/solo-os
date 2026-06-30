#!/usr/bin/env bash
# Solo OS one-line installer
#
# Usage (from a fresh Mac):
#   curl -fsSL https://raw.githubusercontent.com/annahickman-maker/solo-os/main/install.sh | bash
#
# What this does, in order:
#   1. Makes sure Node 20+ and the Claude Code CLI are installed (installs them
#      if missing), and that you're signed into Claude.
#   2. Downloads a fresh copy of the code.
#   3. Installs the code INSIDE /Applications/Solo OS.app (self-contained, off
#      iCloud) and builds the app launcher.
#   4. Seeds your VAULT at ~/Desktop/Solo OS on first install only.
#   5. Opens Solo OS.
#
# Two folders, two jobs:
#   • CODE  -> /Applications/Solo OS.app   (refreshed by reinstall + the update
#                                           button; never on iCloud)
#   • VAULT -> ~/Desktop/Solo OS           (your data; seeded once, NEVER
#                                           overwritten by a reinstall)
#
# Safe to run anytime - this is ALSO the reinstall command. A reinstall refreshes
# the app's code and leaves your ~/Desktop/Solo OS vault completely untouched.
# Existing members who installed the old way (~/Desktop/solo-os) are migrated:
# their vault is preserved to ~/Desktop/Solo OS and the old folder is moved to
# the Trash (recoverable).
#
# Advanced / testing overrides (env vars):
#   SOLO_OS_SRC=<dir>      install from a local checkout instead of cloning
#   APP_BUNDLE=<path>      target .app (default /Applications/Solo OS.app)
#   VAULT_DIR=<path>       vault location (default ~/Desktop/Solo OS)
#   SOLO_OS_NO_LAUNCH=1    don't open the app at the end

set -e

REPO_URL="https://github.com/annahickman-maker/solo-os.git"
APP_BUNDLE="${APP_BUNDLE:-/Applications/Solo OS.app}"
VAULT_DIR="${VAULT_DIR:-$HOME/Desktop/Solo OS}"
LEGACY_DIR="${LEGACY_DIR:-$HOME/Desktop/solo-os}"   # old member layout (code+vault on Desktop)
STAGING="$HOME/.solo-os-staging"                    # off iCloud (home, not Desktop)

# ─── pretty output helpers ────────────────────────────────────────────────

bold=$(tput bold 2>/dev/null || echo "")
dim=$(tput dim 2>/dev/null || echo "")
green=$(tput setaf 2 2>/dev/null || echo "")
yellow=$(tput setaf 3 2>/dev/null || echo "")
reset=$(tput sgr0 2>/dev/null || echo "")

step()    { echo ""; echo "${bold}→ $1${reset}"; }
ok()      { echo "${green}✓${reset} $1"; }
info()    { echo "${dim}  $1${reset}"; }
warn()    { echo "${yellow}!${reset} $1"; }
fail()    { echo ""; echo "${bold}Something went wrong:${reset} $1"; echo "  Drop this error in the SS community and I'll help you get unstuck."; exit 1; }

# ─── intro ────────────────────────────────────────────────────────────────

cat <<EOF

${bold}Solo OS installer${reset}
${dim}This will set up your local dashboard. About 5 minutes.${reset}
${dim}Code goes in /Applications/Solo OS.app. Your vault goes in ~/Desktop/Solo OS.${reset}

EOF

# ─── 0. PATH bootstrap ────────────────────────────────────────────────────
# Under `curl | bash` the shell is non-interactive + non-login, so the profile
# files never run and brew / nvm-installed node aren't on PATH. Load them.

if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

if [ -d "$HOME/.nvm/versions/node" ]; then
  latest_nvm_node=$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  if [ -n "$latest_nvm_node" ] && [ -d "$HOME/.nvm/versions/node/$latest_nvm_node/bin" ]; then
    export PATH="$HOME/.nvm/versions/node/$latest_nvm_node/bin:$PATH"
  fi
fi

# ─── 1. Node ──────────────────────────────────────────────────────────────

step "Checking for Node 20+"
node_ok=false
if command -v node >/dev/null 2>&1; then
  node_major=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$node_major" -ge 20 ] 2>/dev/null; then
    ok "Node $(node -v) already installed."
    node_ok=true
  else
    info "Found Node $(node -v) but need 20 or higher."
  fi
fi

if [ "$node_ok" = false ]; then
  if ! command -v brew >/dev/null 2>&1; then
    fail "Node 20+ is not installed, and neither is Homebrew. Install Homebrew first, then re-run the installer:
    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"

  Or install Node 20+ another way (nvm, the installer from nodejs.org) and re-run."
  fi
  info "Installing Node via Homebrew."
  brew install node || fail "Node install failed."
  ok "Node $(node -v) installed."
fi

# ─── 2. Claude Code CLI ───────────────────────────────────────────────────

step "Checking for Claude Code CLI"
if ! command -v claude >/dev/null 2>&1; then
  info "Not installed. Installing now."
  npm install -g @anthropic-ai/claude-code || fail "Claude Code install failed."
  ok "Claude Code installed."
else
  ok "Claude Code already installed."
fi

# ─── 3. Claude auth ───────────────────────────────────────────────────────

step "Signing into Claude"
if claude auth status >/dev/null 2>&1; then
  ok "Already signed in."
else
  info "Opening your browser to sign in. Come back here when you're done."
  echo ""
  claude auth login || fail "Claude sign-in didn't complete."
  ok "Signed in."
fi

# ─── 4. Get the source code ────────────────────────────────────────────────
# Either a local checkout (testing / offline) or a fresh clone into staging.
# Staging lives in $HOME (NOT on the Desktop), so it's never iCloud-synced.

if [ -n "${SOLO_OS_SRC:-}" ]; then
  [ -d "$SOLO_OS_SRC" ] || fail "SOLO_OS_SRC is set but not a directory: $SOLO_OS_SRC"
  SRC="$SOLO_OS_SRC"
  step "Using local source"
  info "$SRC"
else
  step "Downloading the dashboard"
  rm -rf "$STAGING"
  git clone --depth 1 "$REPO_URL" "$STAGING" || fail "Clone failed. Check your internet connection."
  SRC="$STAGING"
  ok "Downloaded a fresh copy."
fi

# ─── 5. Migrate an old-style install (code+vault on the Desktop) ───────────
# Older installs put everything in ~/Desktop/solo-os, with the vault inside it.
# Preserve that vault to ~/Desktop/Solo OS, then move the old folder to the
# Trash (recoverable) so the iCloud-on-Desktop code problems stop.

if [ -d "$LEGACY_DIR" ]; then
  step "Migrating your existing install"
  info "Stopping anything still running from the old copy."
  for p in 5174 8791 8789; do
    pids=$(lsof -ti:"$p" 2>/dev/null || true)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  done
  pkill -f "$LEGACY_DIR/" 2>/dev/null || true
  sleep 1

  # Preserve the member's vault if we don't already have one. The old default
  # vault lived at <legacy>/sample-vault; copy the whole thing so nothing is
  # lost (core files, projects, transcripts, everything).
  if [ ! -e "$VAULT_DIR" ] && [ -d "$LEGACY_DIR/sample-vault" ]; then
    mkdir -p "$(dirname "$VAULT_DIR")"
    cp -R "$LEGACY_DIR/sample-vault" "$VAULT_DIR" \
      && ok "Preserved your vault to $VAULT_DIR" \
      || warn "Could not copy your old vault automatically - it's still safe in the Trash copy below."
  fi

  TRASH_DIR="$HOME/.Trash/solo-os-old-$(date +%Y%m%d-%H%M%S)"
  if mv "$LEGACY_DIR" "$TRASH_DIR" 2>/dev/null; then
    ok "Old copy moved to the Trash ($TRASH_DIR). Recover anything from there if you need it."
  else
    warn "Left the old copy in place at $LEGACY_DIR (couldn't move it). You can delete it once you've confirmed the new install works."
  fi
fi

# ─── 6. Seed the vault (FIRST install only) ────────────────────────────────
# If there's no vault yet, lay down the starter vault. If one already exists
# (reinstall, or just migrated above), leave it ENTIRELY alone.

if [ -e "$VAULT_DIR" ]; then
  step "Your vault"
  ok "Found your vault at $VAULT_DIR - leaving it untouched."
else
  step "Setting up your vault"
  if [ -d "$SRC/sample-vault" ]; then
    mkdir -p "$(dirname "$VAULT_DIR")"
    cp -R "$SRC/sample-vault" "$VAULT_DIR" || fail "Could not create your vault at $VAULT_DIR"
    ok "Created your vault at $VAULT_DIR (seeded with the starter files)."
    info "Drop your own 6 core_*.md files into $VAULT_DIR/01_Core/ when you're ready."
  else
    warn "No starter vault found in the download; creating an empty vault."
    mkdir -p "$VAULT_DIR/01_Core"
  fi
fi

# ─── 7. Build the app (code lands inside /Applications/Solo OS.app) ─────────

step "Installing the app"
info "Putting the code inside the app and building the launcher. ~2 minutes."
APP_BUNDLE="$APP_BUNDLE" bash "$SRC/build-dashboard-app.sh" "$SRC" "$APP_BUNDLE" \
  || fail "App build failed. Scroll up to see the last error."

# Clean up staging (the code now lives in the app).
[ -n "${SOLO_OS_SRC:-}" ] || rm -rf "$STAGING"

# ─── 8. Launch ──────────────────────────────────────────────────────────────

if [ "${SOLO_OS_NO_LAUNCH:-0}" = "1" ]; then
  step "Skipping launch (SOLO_OS_NO_LAUNCH=1)"
else
  step "Launching Solo OS"
  if [ -d "$APP_BUNDLE" ]; then
    open "$APP_BUNDLE"
    ok "Solo OS is starting. Your browser will open in about 10 seconds."
  else
    warn "App bundle not found at $APP_BUNDLE."
  fi
fi

# ─── done ─────────────────────────────────────────────────────────────────

cat <<EOF

${bold}${green}You're in.${reset}

  Dashboard: ${bold}http://localhost:5174${reset}   (password ${bold}dev${reset})
  Your vault: ${bold}$VAULT_DIR${reset}
  Point Claude Code at your vault folder to work in it.

Next time, hit ⌘-space and type "${bold}Solo OS${reset}".

EOF
