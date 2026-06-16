#!/usr/bin/env bash
# Solo OS one-line installer
#
# Usage (from a fresh Mac):
#   curl -fsSL https://raw.githubusercontent.com/annahickman-maker/solo-os/main/install.sh | bash
#
# What this does, in order:
#   1. Checks for Homebrew, installs if missing
#   2. Checks for Node 20+, installs via brew if missing
#   3. Checks for the Claude Code CLI, installs via npm if missing
#   4. Prompts the user to sign into Claude (opens browser)
#   5. Clones the solo-os repo to ~/Desktop/solo-os
#   6. Runs ./setup.sh (npm install + builds Solo OS.app into /Applications)
#   7. Opens Solo OS.app so the dashboard lands in the browser
#
# The script is non-destructive. If something is already installed
# or already cloned, it skips that step and moves on.

set -e

REPO_URL="https://github.com/annahickman-maker/solo-os.git"
INSTALL_DIR="$HOME/Desktop/solo-os"
APP_BUNDLE="/Applications/Solo OS.app"

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

EOF

# ─── 0. PATH bootstrap ────────────────────────────────────────────────────
# When this script runs via `curl | bash`, the shell is non-interactive and
# non-login, so ~/.zprofile / ~/.bash_profile never execute. brew and
# nvm-installed node end up in standard locations but NOT on PATH, which
# makes `command -v brew` and `command -v node` falsely report "not
# installed". Load them ourselves before the checks below.

if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

# nvm installs node at ~/.nvm/versions/node/<version>/bin. Pick the highest
# installed version so a 20.x install satisfies our Node 20+ check.
if [ -d "$HOME/.nvm/versions/node" ]; then
  latest_nvm_node=$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  if [ -n "$latest_nvm_node" ] && [ -d "$HOME/.nvm/versions/node/$latest_nvm_node/bin" ]; then
    export PATH="$HOME/.nvm/versions/node/$latest_nvm_node/bin:$PATH"
  fi
fi

# ─── 1. Node ──────────────────────────────────────────────────────────────
# Node 20+ is the only hard requirement. If it's already on PATH (or we
# loaded it from nvm above), we can skip the whole brew dance entirely.

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
  # Need to install Node. We rely on Homebrew for this. If brew is also
  # missing we have to bail - Homebrew's own installer requires TTY +
  # sudo, which `curl | bash` doesn't have.
  if ! command -v brew >/dev/null 2>&1; then
    fail "Node 20+ is not installed, and neither is Homebrew. Install Homebrew first, then re-run the installer:
    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"

  Or install Node 20+ another way (nvm, the installer from nodejs.org) and re-run."
  fi
  info "Installing Node via Homebrew."
  brew install node || fail "Node install failed."
  ok "Node $(node -v) installed."
fi

# ─── 3. Claude Code CLI ───────────────────────────────────────────────────

step "Checking for Claude Code CLI"
if ! command -v claude >/dev/null 2>&1; then
  info "Not installed. Installing now."
  npm install -g @anthropic-ai/claude-code || fail "Claude Code install failed."
  ok "Claude Code installed."
else
  ok "Claude Code already installed."
fi

# ─── 4. Claude auth ───────────────────────────────────────────────────────

step "Signing into Claude"
if claude auth status >/dev/null 2>&1; then
  ok "Already signed in."
else
  info "Opening your browser to sign in. Come back here when you're done."
  echo ""
  claude auth login || fail "Claude sign-in didn't complete."
  ok "Signed in."
fi

# ─── 5. Clone the repo ────────────────────────────────────────────────────

step "Downloading the dashboard"
if [ -d "$INSTALL_DIR" ]; then
  warn "$INSTALL_DIR already exists. Using the existing folder."
  info "If you want a fresh copy, delete it first and re-run this script."
else
  git clone "$REPO_URL" "$INSTALL_DIR" || fail "Clone failed. Check your internet connection."
  ok "Downloaded to $INSTALL_DIR"
fi

# ─── 6. setup.sh ──────────────────────────────────────────────────────────

step "Setting up the dashboard"
info "Installing dependencies and building Solo OS.app. Takes about 2 minutes."
cd "$INSTALL_DIR"
./setup.sh || fail "Setup failed. Scroll up to see the last error."

# Give macOS Spotlight ~60s to finish indexing the freshly-cloned folder
# BEFORE we launch the dashboard. Spotlight touches inode metadata during
# its first pass, which Vite's file watcher misreads as source edits and
# starts a cascade of phantom "page reload" pushes to the browser. The
# net effect: a 1-2 minute window where the page never finishes mounting.
# Sleeping here lets the indexer drain before Vite starts watching.
step "Letting macOS finish indexing the new files"
info "About a minute. This makes the first launch smooth."
sleep 60
ok "Ready to launch."

# ─── 7. Launch ────────────────────────────────────────────────────────────

step "Launching Solo OS"
if [ -d "$APP_BUNDLE" ]; then
  open "$APP_BUNDLE"
  ok "Solo OS is starting. Your browser will open in about 10 seconds."
else
  warn "App bundle not found at $APP_BUNDLE. Run ./setup.sh again."
fi

# ─── done ─────────────────────────────────────────────────────────────────

cat <<EOF

${bold}${green}You're in.${reset}

The dashboard opens at ${bold}http://localhost:5174${reset} (password ${bold}dev${reset}).

Next time you want to open it, just hit ⌘-space and type "${bold}Solo OS${reset}".

EOF
