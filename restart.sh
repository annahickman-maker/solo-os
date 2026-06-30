#!/bin/bash
# Restart the dashboard from inside the app. Invoked DETACHED by the Settings
# "update + restart" button (server/src/routes/updateSoloOs.ts) so it survives
# the very services it kills.
#
# Arg 1 = DASH_DIR (the dashboard repo root). Stops every process belonging to
# THIS dashboard - supervisors matched by working dir, services by argv path -
# so other dashboard instances on the machine are left untouched. Then
# relaunches start-local.sh, which rebuilds the frontend if the code changed
# and brings all three services back. No lock handling needed: start-local.sh
# treats a dead-PID lock as stale, so this stays instance-agnostic.
set -u
DASH_DIR="${1:?usage: restart.sh <dashboard-root>}"

# Let the HTTP 200 flush back to the browser before we start killing.
sleep 1

# A few passes so the supervisor's respawn loop can't win the race.
for _ in 1 2 3; do
  for pid in $(pgrep -f "start-local.sh" 2>/dev/null); do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep '^n' | sed 's/^n//')
    [ "$cwd" = "$DASH_DIR" ] && kill "$pid" 2>/dev/null
  done
  for pid in $(ps ax -o pid=,command= | grep "$DASH_DIR" | grep -v "restart.sh" | grep -v grep | awk '{print $1}'); do
    kill "$pid" 2>/dev/null
  done
  sleep 1
done

# Relaunch (rebuilds frontend if code changed, restarts all three services).
cd "$DASH_DIR" && nohup ./start-local.sh > /tmp/dashboard-restart.log 2>&1 &
