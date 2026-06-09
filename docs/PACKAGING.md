# Shipping AIIA as one package

Status: planned; Brain-side build tooling landed in `ericlovo/aiia`
(`packaging/`, `local_brain/standalone.py`). Console-side sidecar wiring is the
next increment.

## Product

A single DMG that gives one person the whole system: **console UI + Brain +
persistent memory**, local-first. Free and local is the security story — your
memory never leaves your machine unless you deliberately put Tailscale in
front of it.

```
AIIA.app
├── aiia-console            Tauri app (this repo)
├── aiia-brain              Brain frozen to one binary (PyInstaller),
│                           bundled via Tauri bundle.externalBin
│   • spawned on app launch, killed on app quit
│   • binds 127.0.0.1:8100 — loopback-only by default
│   • memory/ChromaDB under ~/.aiia (survives updates/reinstalls)
└── Ollama                  NOT bundled — detected at :11434;
                            offer install link when absent
```

Cloud providers (Anthropic/OpenAI/…) remain optional via the existing
keystore. Tailscale remains the optional reach layer (other Macs, iOS thin
client — see `docs/IOS.md`); it fronts the same `:8100`, nothing about the
package changes.

## First-run experience

1. Open AIIA.app → console spawns `aiia-brain` → polls `/health`.
2. Title-bar pill shows **Brain: local** once healthy. Memory works
   immediately, zero config.
3. If Ollama isn't running: point at the install (`brew install ollama` /
   ollama.com), or use a cloud key. Either path works; neither blocks memory.

## Build pipeline

1. **Brain binary** (in `ericlovo/aiia`, on the target-arch Mac):
   ```bash
   pip install -e ".[dev]" pyinstaller
   AIIA_CONSOLE_DIR=~/aiia-console ./packaging/build-brain.sh
   ```
   Produces `aiia-brain-aarch64-apple-darwin` (~hundreds of MB; ChromaDB pulls
   onnxruntime), smoke-tests `/health`, copies into
   `src-tauri/binaries/`.
2. **Console bundle** (this repo): add to `tauri.conf.json`:
   ```json
   "bundle": { "externalBin": ["binaries/aiia-brain"] }
   ```
   `npm run tauri build` then emits the DMG with the sidecar inside.

## Console-side work (next increments)

- **Sidecar lifecycle (Rust):** spawn the bundled `aiia-brain` on launch when
  Brain mode = local, kill on exit, restart on crash, surface state to the UI.
- **Brain mode setting:** `local (bundled)` | `remote (URL + token)` — the
  remote path is already built (Settings → Connection).
- **Ollama detection:** probe `:11434`, show install guidance when absent.
- **Updates:** Tauri updater for the app; the sidecar rides along inside the
  bundle. Memory under `~/.aiia` is untouched by updates.

## Distribution gates

- **Signing/notarization:** Developer ID cert is lapsed (see BUILD.md) —
  required for a DMG that opens without right-click→Open gymnastics.
- **Binary size:** expect a 300–500 MB DMG (onnxruntime dominates). Fine for
  direct download; revisit if it matters.
- **Sidecar smoke test in CI:** `build-brain.sh` already health-checks the
  frozen binary; wire it into a release workflow on a macOS runner when
  releases formalize.
