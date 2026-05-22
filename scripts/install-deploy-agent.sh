#!/usr/bin/env bash
# One-shot installer for the aiia-console auto-deploy LaunchAgent.
# Copies the plist into ~/Library/LaunchAgents/ and (re)loads it.
# Re-runnable — bootout-then-bootstrap makes it idempotent.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.aplora.aiia-console.deploy"
SRC_PLIST="${REPO_DIR}/scripts/${LABEL}.plist"
DEST_PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"

if [[ ! -f "$SRC_PLIST" ]]; then
    echo "ERROR: source plist not found at $SRC_PLIST" >&2
    exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents"
cp "$SRC_PLIST" "$DEST_PLIST"
echo "Installed ${DEST_PLIST}"

launchctl bootout "gui/${UID_NUM}" "$DEST_PLIST" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$DEST_PLIST"
launchctl enable "gui/${UID_NUM}/${LABEL}"

echo "Loaded ${LABEL}"
echo
echo "Polls main every 120 seconds. Check status:"
echo "  launchctl print gui/${UID_NUM}/${LABEL}"
echo
echo "Tail logs:"
echo "  tail -f \$HOME/.aiia/logs/console-deploy.log"
echo
echo "Disable temporarily:"
echo "  launchctl disable gui/${UID_NUM}/${LABEL}"
