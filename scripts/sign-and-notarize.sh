#!/usr/bin/env bash
#
# Sign + notarize a fully-assembled "AIIA Console.app" and produce a stapled,
# double-click-clean DMG.
#
# Why this exists: the ollama-runtime + model are injected into the app AFTER
# `tauri build` (see mini-deploy.sh), and tauri only auto-signs the declared
# externalBin. So the nested ollama binary + dylibs are unsigned at that point,
# and notarization will reject the bundle. This script signs everything
# inside-out (dylibs -> nested executables -> app), packages a DMG, and
# notarizes it.
#
# Prereqs (one-time, on the build machine):
#   - "Developer ID Application: Code Word Technologies Inc. (2SA8HN3DMZ)" cert
#     in the keychain (Xcode -> Accounts -> Manage Certificates).
#   - A notarytool keychain profile:
#       xcrun notarytool store-credentials AIIA-NOTARY \
#         --apple-id ericlovold@gmail.com --team-id 2SA8HN3DMZ
#
# Usage:
#   scripts/sign-and-notarize.sh "/path/to/AIIA Console.app" [output.dmg]
#
# Override identity/profile via env: SIGN_IDENTITY=..., NOTARY_PROFILE=...
set -euo pipefail

APP="${1:?usage: sign-and-notarize.sh <path-to-.app> [out.dmg]}"
OUT="${2:-AIIA-Console-arm64.dmg}"
ID="${SIGN_IDENTITY:-Developer ID Application: Code Word Technologies Inc. (2SA8HN3DMZ)}"
PROFILE="${NOTARY_PROFILE:-AIIA-NOTARY}"
ENT="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/Entitlements.plist"

[ -d "$APP" ] || { echo "error: app not found: $APP" >&2; exit 1; }
[ -f "$ENT" ] || { echo "error: entitlements not found: $ENT" >&2; exit 1; }

echo "==> 1/5 signing dylibs (hardened runtime)"
while IFS= read -r -d '' lib; do
  codesign --force --timestamp --options runtime --sign "$ID" "$lib"
done < <(find "$APP" -type f -name "*.dylib" -print0)

echo "==> 2/5 signing nested executables (entitlements + runtime)"
for bin in \
  "$APP/Contents/Resources/ollama-runtime/ollama" \
  "$APP/Contents/MacOS/aiia-brain"; do
  [ -f "$bin" ] && codesign --force --timestamp --options runtime \
    --entitlements "$ENT" --sign "$ID" "$bin"
done

echo "==> 3/5 signing app bundle (seals everything)"
codesign --force --timestamp --options runtime --entitlements "$ENT" --sign "$ID" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

echo "==> 4/5 building + signing DMG"
STAGE="$(mktemp -d)"
ditto "$APP" "$STAGE/$(basename "$APP")"
ln -s /Applications "$STAGE/Applications"
rm -f "$OUT"
hdiutil create -volname "AIIA Console" -srcfolder "$STAGE" -ov -format UDZO "$OUT"
rm -rf "$STAGE"
codesign --force --timestamp --sign "$ID" "$OUT"

echo "==> 5/5 notarizing (uploads the full DMG, then waits)"
xcrun notarytool submit "$OUT" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$OUT"
xcrun stapler validate "$OUT"

echo "==> DONE — signed, notarized, stapled: $OUT"
echo "    verify: spctl -a -vvv (mount the dmg, assess the .app inside)"
