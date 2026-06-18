#!/usr/bin/env bash
# build-bundle.sh — one command → a notarized, model-bundled AIIA Console DMG.
#
# Does the whole pipeline: tauri build → embed the Ollama runtime + a local
# model into the .app → sign + notarize + staple via sign-and-notarize.sh.
#
# Run on the Mac that has the Developer ID cert + the AIIA-NOTARY notarytool
# profile (see scripts/sign-and-notarize.sh header for the one-time setup).
#
# Usage:
#   scripts/build-bundle.sh
#   BUNDLE_MODEL=gemma3:4b OUT=~/Desktop/AIIA.dmg scripts/build-bundle.sh
set -euo pipefail
cd "$(dirname "$0")/.."

MODEL="${BUNDLE_MODEL:-gemma3:1b}"
APP="src-tauri/target/release/bundle/macos/AIIA Console.app"
OLLAMA_RES="/Applications/Ollama.app/Contents/Resources"
OUT="${OUT:-$HOME/Desktop/AIIA-Console.dmg}"

say() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ── Prereqs ───────────────────────────────────────────────────────────────
command -v ollama >/dev/null || die "Ollama not installed (needed for the runtime + model). See ollama.com."
[ -d "$OLLAMA_RES" ] || die "Ollama.app runtime not found at $OLLAMA_RES"
ls src-tauri/binaries/aiia-brain-* >/dev/null 2>&1 \
  || die "Brain binary missing. Build it in the aiia-brain repo: packaging/build-brain.sh, then copy into src-tauri/binaries/."
[ -f scripts/sign-and-notarize.sh ] || die "scripts/sign-and-notarize.sh missing."

# ── Ensure the model is pulled ──────────────────────────────────────────────
say "Ensuring model $MODEL is available"
ollama list | awk '{print $1}' | grep -qx "$MODEL" || ollama pull "$MODEL"

# ── Build the app ───────────────────────────────────────────────────────────
say "Building app (tauri build)"
npm run tauri build

# ── Embed the Ollama runtime (verbatim — it dlopens its dylibs from its own dir)
say "Embedding Ollama runtime"
RES="$APP/Contents/Resources"
rm -rf "$RES/ollama-runtime"; mkdir -p "$RES/ollama-runtime"
cp "$OLLAMA_RES/ollama" "$OLLAMA_RES"/*.dylib "$OLLAMA_RES/mlx.metallib" "$RES/ollama-runtime/"

# ── Embed the model (manifest + the blobs it references) ────────────────────
say "Embedding model $MODEL"
MSRC="$HOME/.ollama/models"
NAME="${MODEL%%:*}"; TAG="${MODEL##*:}"
MAN="$MSRC/manifests/registry.ollama.ai/library/$NAME/$TAG"
[ -f "$MAN" ] || die "Model manifest not found: $MAN"
rm -rf "$RES/ollama-models"
mkdir -p "$RES/ollama-models/manifests/registry.ollama.ai/library/$NAME" "$RES/ollama-models/blobs"
cp "$MAN" "$RES/ollama-models/manifests/registry.ollama.ai/library/$NAME/$TAG"
python3 -c "import json;m=json.load(open('$MAN'));print('\n'.join([l['digest'] for l in m.get('layers',[])]+[m['config']['digest']]))" \
  | while read -r d; do cp "$MSRC/blobs/${d/:/-}" "$RES/ollama-models/blobs/"; done

# ── Sign + notarize + staple + DMG ──────────────────────────────────────────
say "Signing + notarizing (Developer ID)"
bash scripts/sign-and-notarize.sh "$APP" "$OUT"

say "Done → $OUT  ($(du -h "$OUT" | cut -f1))"
