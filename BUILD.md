# Building ⌬ AIIA Console

This doc covers running and building the desktop app. It's separate from `README.md`
(product framing) and `CONTRIBUTING.md` (general dev guide) — those don't change
when the build pipeline does, and this one will.

## Prerequisites (macOS)

- Node 22+ and npm 10+
- Rust toolchain (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Xcode Command Line Tools (`xcode-select --install`)

Tauri 2 needs all three. Linux/Windows have their own native deps — see the
[Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

## Run in dev

```bash
npm install
npm run tauri dev
```

`tauri dev` boots Vite (frontend) and a Tauri Rust shell pointing at it.
First run compiles Rust deps — expect 2–5 min. Subsequent runs are seconds.

**Optional**: run the AIIA Brain in another shell so the Memory tab sees real
data instead of the SQLite fallback:

```bash
cd ~/AIIA          # or wherever your aiia checkout lives
uvicorn local_brain.main:app --port 8100
```

## Production build (unsigned)

```bash
npm install
npm run tauri build
```

Outputs land in `src-tauri/target/release/bundle/`:

- `macos/aiia-console.app` — runnable bundle
- `dmg/aiia-console_<version>_aarch64.dmg` (Apple Silicon) or `_x64.dmg` (Intel)

### Gatekeeper note

The build is **unsigned** — the Apple Developer cert is currently lapsed.
First-launch Gatekeeper will refuse to open the app. Workarounds:

- **Finder**: right-click the `.app` → Open → Open anyway in the dialog
- **CLI**: `xattr -dr com.apple.quarantine src-tauri/target/release/bundle/macos/aiia-console.app`

Once the cert is renewed, add signing config to `src-tauri/tauri.conf.json`
under `bundle.macOS.signingIdentity` and notarize with `notarytool`.

## Frontend-only build (smoke test)

Useful in CI or headless environments where Tauri's native stack isn't
available:

```bash
npm install
npm run build    # tsc + vite build → dist/
```

This catches TypeScript errors and Vite bundling issues without invoking the
Rust/Tauri toolchain.

## Troubleshooting

- **`error: linker 'cc' not found`** — install Xcode CLT (`xcode-select --install`)
- **`failed to run custom build command for webkit2gtk-sys`** (Linux) — install
  `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`,
  `librsvg2-dev`
- **`app is damaged and can't be opened`** on macOS — Gatekeeper quarantine,
  see the CLI workaround above
- **Brain not detected** — check `localhost:8100` is reachable; the Memory tab
  falls back to local SQLite if it isn't
