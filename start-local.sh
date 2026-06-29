#!/bin/bash
# Hardened solo os launcher. Three services, each supervised in its own
# restart loop. If a service crashes, its supervisor restarts it after 2s.
# Ctrl-C (or closing the Terminal window) stops every service cleanly.
#
# Services:
#   :8791   server         File-based API (all routes read/write the vault)
#   :5174   frontend       Vite dev server
#   :8789   claude-bridge  spawns `claude -p` for AI features
#
# Logs live in /tmp/solo-os-{server,frontend,claude-bridge}.log
# Each line is prefixed with a timestamp + service name so you can tail any.

set -u
# Resolve this script's own folder so the launcher works no matter where the
# template is dropped on disk.
DASH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/tmp"

# Ensure node/npm are findable when launched via Finder (no shell init).
# Cover the three common install paths: nvm (any version), Apple Silicon
# Homebrew (/opt/homebrew/bin), Intel Homebrew (/usr/local/bin). Pick the
# newest installed nvm version dynamically so we don't break when the user
# upgrades node or never had v20.20.2 in the first place.
NVM_BIN=""
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_BIN=$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -1)
fi
export PATH="${NVM_BIN:+$NVM_BIN:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Vault root the server reads/writes. Override with the VAULT_ROOT env var
# (set it before running this script) to point at a different vault folder.
# Default is the bundled sample-vault sitting next to this script.
VAULT_ROOT_DEFAULT="$DASH_DIR/sample-vault"
VAULT_ROOT="${VAULT_ROOT:-$VAULT_ROOT_DEFAULT}"

# ─── Single-instance guard ────────────────────────────────────────────────
LOCK_FILE="$LOG_DIR/solo-os-launcher.pid"
if [ -f "$LOCK_FILE" ]; then
  OTHER_PID=$(cat "$LOCK_FILE" 2>/dev/null)
  if [ -n "$OTHER_PID" ] && kill -0 "$OTHER_PID" 2>/dev/null; then
    echo ""
    echo "  solo os is already running (PID $OTHER_PID)."
    echo "  opening http://localhost:5174 ..."
    open -a "Google Chrome" http://localhost:5174 2>/dev/null || open http://localhost:5174
    sleep 2
    exit 0
  fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# Read optional secrets from server/.env (none are required to boot - the
# YouTube / Stripe / Instagram features simply won't return data until keys
# are filled in).
ENV_FILE="$DASH_DIR/server/.env"
YT_KEY=$(grep YOUTUBE_API_KEY "$ENV_FILE" 2>/dev/null | cut -d= -f2)
YT_HANDLE=$(grep YOUTUBE_CHANNEL_HANDLE "$ENV_FILE" 2>/dev/null | cut -d= -f2)
STRIPE_KEY=$(grep STRIPE_API_KEY "$ENV_FILE" 2>/dev/null | cut -d= -f2)
IG_HANDLE=$(grep INSTAGRAM_HANDLE "$ENV_FILE" 2>/dev/null | cut -d= -f2)
IG_TOKEN=$(grep "^INSTAGRAM_ACCESS_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
IG_BIZ_ID=$(grep "^INSTAGRAM_BUSINESS_ACCOUNT_ID=" "$ENV_FILE" 2>/dev/null | cut -d= -f2)

stamp() {
  local label="$1"
  while IFS= read -r line; do
    printf '[%s] [%s] %s\n' "$(date +%H:%M:%S)" "$label" "$line"
  done
}

spawn_supervised() {
  local label="$1"; local port="$2"; local logfile="$3"; shift 3
  (
    : > "$logfile"
    while true; do
      local stale
      stale=$(lsof -ti:"$port" 2>/dev/null | head -1)
      if [ -n "$stale" ]; then
        kill -9 "$stale" 2>/dev/null || true
        sleep 0.3
      fi
      printf '[%s] [%s] starting on :%s\n' "$(date +%H:%M:%S)" "$label" "$port" >> "$logfile"
      "$@" 2>&1 | stamp "$label" >> "$logfile"
      local code=${PIPESTATUS[0]}
      printf '[%s] [%s] exited (code %s), restarting in 2s\n' "$(date +%H:%M:%S)" "$label" "$code" >> "$logfile"
      sleep 2
    done
  ) &
  SUPERVISORS+=("$!")
}

SUPERVISORS=()

cleanup() {
  echo ""
  echo "stopping all services..."
  for pid in "${SUPERVISORS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  for port in 5174 8789 8791; do
    lsof -ti:"$port" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  done
  pkill -f "tsx src/index.ts" 2>/dev/null || true
  pkill -f "tsx server.ts" 2>/dev/null || true
  pkill -f "vite" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

cd "$DASH_DIR"

# ─── start each service supervised ───────────────────────────────────────

spawn_supervised server 8791 "$LOG_DIR/solo-os-server.log" \
  env \
    PORT=8791 \
    VAULT_ROOT="$VAULT_ROOT" \
    DASHBOARD_PASSWORD=dev \
    CLAUDE_BRIDGE_URL=http://localhost:8789/run \
    YOUTUBE_API_KEY="$YT_KEY" \
    YOUTUBE_CHANNEL_HANDLE="$YT_HANDLE" \
    STRIPE_API_KEY="$STRIPE_KEY" \
    INSTAGRAM_HANDLE="$IG_HANDLE" \
    INSTAGRAM_ACCESS_TOKEN="$IG_TOKEN" \
    INSTAGRAM_BUSINESS_ACCOUNT_ID="$IG_BIZ_ID" \
    bash -c 'cd server && npm start'

# Frontend. Default: serve a pre-built bundle for fast opens. The build is
# rebuilt automatically only when the source changed since the last build (e.g.
# you used Claude Code to edit the dashboard), so your changes always show up -
# they just appear on the next launch instead of live. For actively iterating on
# dashboard code with live hot-reload, run:  DEV_MODE=1 ./start-local.sh
DEV_MODE="${DEV_MODE:-0}"
if [ "$DEV_MODE" = "1" ]; then
  echo "  frontend: dev mode (hot reload)"
  spawn_supervised frontend 5174 "$LOG_DIR/solo-os-frontend.log" \
    bash -c 'cd frontend && npm run dev'
else
  # Rebuild if there's no build yet, or any source file is newer than it. Use
  # `vite build` directly (no tsc) so a stray type error never blocks the fast
  # path - if the build genuinely fails, fall back to the dev server.
  serve_built=1
  if [ ! -f frontend/dist/index.html ] || \
     [ -n "$(find frontend/src frontend/index.html frontend/vite.config.ts frontend/package.json -newer frontend/dist/index.html 2>/dev/null | head -1)" ]; then
    echo "  frontend: building (first run or code changed since last build)..."
    if ! ( cd frontend && npx vite build >"$LOG_DIR/solo-os-frontend-build.log" 2>&1 ); then
      echo "  ⚠ frontend build failed (see $LOG_DIR/solo-os-frontend-build.log) - using dev server"
      serve_built=0
    fi
  fi
  if [ "$serve_built" = 1 ]; then
    echo "  frontend: serving built bundle (fast)"
    spawn_supervised frontend 5174 "$LOG_DIR/solo-os-frontend.log" \
      bash -c 'cd frontend && npm run preview'
  else
    spawn_supervised frontend 5174 "$LOG_DIR/solo-os-frontend.log" \
      bash -c 'cd frontend && npm run dev'
  fi
fi

spawn_supervised claude-bridge 8789 "$LOG_DIR/solo-os-claude-bridge.log" \
  bash -c 'cd claude-bridge && npm start'

# Wait for server + frontend to accept connections instead of a blanket sleep.
# ~1-2s on a fast machine, longer only if the machine genuinely needs it.
ready=0
for _ in $(seq 1 120); do   # up to ~12s
  if lsof -ti:8791 >/dev/null 2>&1 && lsof -ti:5174 >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 0.1
done
[ "$ready" = 1 ] || echo "  (services still starting; supervisor will keep retrying)"

check_port() {
  local port="$1"; local label="$2"
  if lsof -i:"$port" >/dev/null 2>&1; then
    echo "  ✓ $label running on http://localhost:$port"
  else
    echo "  ⚠ $label not yet up on :$port (supervisor will retry)"
  fi
}

echo ""
echo "─────────────────────────────────────────────"
echo "  solo os running locally"
echo ""
echo "  vault root: $VAULT_ROOT"
echo ""
check_port 5174 "frontend     "
check_port 8791 "server       "
check_port 8789 "claude-bridge"
echo ""
echo "  → open    http://localhost:5174"
echo "  → password: dev"
echo ""
echo "  logs:"
echo "    tail -f $LOG_DIR/solo-os-server.log"
echo "    tail -f $LOG_DIR/solo-os-frontend.log"
echo "    tail -f $LOG_DIR/solo-os-claude-bridge.log"
echo ""
echo "  Each service auto-restarts on crash. Ctrl-C stops everything."
echo "─────────────────────────────────────────────"
echo ""

wait
