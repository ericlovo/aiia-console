#!/usr/bin/env bash
# Auto-deploy hook for aiia-console on the Mac mini.
# Polled by a LaunchAgent (see com.aplora.aiia-console.deploy.plist).
# Pulls main if SHA changed, rebuilds the Tauri .app, relaunches it.
#
# Environment overrides:
#   AIIA_CONSOLE_REPO_DIR    Path to repo (default: $HOME/code/aiia-console)
#   AIIA_CONSOLE_DEPLOY_LOG  Log file (default: $HOME/.aiia/logs/console-deploy.log)
#   AIIA_CONSOLE_SKIP_RELAUNCH  If "1", build but don't kill/open the .app

set -euo pipefail

REPO_DIR="${AIIA_CONSOLE_REPO_DIR:-$HOME/code/aiia-console}"
APP_NAME="aiia-console"
APP_BUNDLE="$REPO_DIR/src-tauri/target/release/bundle/macos/${APP_NAME}.app"
LOG_FILE="${AIIA_CONSOLE_DEPLOY_LOG:-$HOME/.aiia/logs/console-deploy.log}"
LOCK_FILE="/tmp/${APP_NAME}-deploy.lock"

mkdir -p "$(dirname "$LOG_FILE")"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG_FILE"; }

# Prevent overlapping runs (build can take longer than 2 min poll interval).
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    exit 0
fi

cd "$REPO_DIR" || { log "FAIL: repo not at $REPO_DIR"; exit 1; }

git fetch origin main --quiet
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse origin/main)

if [[ "$local_sha" == "$remote_sha" ]]; then
    exit 0
fi

log "SHA changed: ${local_sha:0:7} → ${remote_sha:0:7}. Deploying..."

if ! git pull --ff-only origin main >> "$LOG_FILE" 2>&1; then
    log "FAIL: pull --ff-only failed (local diverged from main). Manual intervention needed."
    exit 1
fi

log "Running npm install..."
if ! npm install --no-audit --no-fund >> "$LOG_FILE" 2>&1; then
    log "FAIL: npm install failed."
    exit 1
fi

log "Running npm run tauri build..."
if ! npm run tauri build >> "$LOG_FILE" 2>&1; then
    log "FAIL: tauri build failed."
    exit 1
fi

if [[ "${AIIA_CONSOLE_SKIP_RELAUNCH:-0}" == "1" ]]; then
    log "OK: built ${remote_sha:0:7} (skipping relaunch per AIIA_CONSOLE_SKIP_RELAUNCH=1)"
    exit 0
fi

if [[ -d "$APP_BUNDLE" ]]; then
    pkill -f "${APP_NAME}.app/Contents/MacOS/${APP_NAME}" 2>/dev/null || true
    sleep 1
    open "$APP_BUNDLE"
    log "OK: relaunched ${APP_NAME}.app at ${remote_sha:0:7}"
else
    log "WARN: build succeeded but bundle not found at $APP_BUNDLE. Skipping relaunch."
fi
