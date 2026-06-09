# AIIA Console on iOS / iPadOS

Status: planning + groundwork. The Rust crate is already structured for Tauri 2
mobile (`[lib] crate-type = ["staticlib","cdylib","rlib"]`, `mobile_entry_point`
on `run()`), so `tauri ios init` works without restructuring.

## Goal

Personal, single-user AIIA reachable from **iPhone and iPad**, mirroring the
desktop experience (chat · memory · journal) with a layout that adapts per
device. Data is **remote-first** to the user's own Brain over Tailscale.
**Voice capture is first-class.**

This is explicitly *not* a multi-tenant / multi-user product — one person, one
Brain, many of their own devices.

## Architecture: remote-first thin client

The **UI mirrors desktop**; the **data layer is remote**. The phone/iPad are
thin clients to the Brain on the user's always-on machine (the mini).

- The device stores only the **Brain URL + Brain token** (in iOS-appropriate
  storage — app data / Keychain). No provider API keys on the device.
- **Chat** streams from the Brain (`POST /v1/aiia/ask/stream`); the Brain
  proxies the LLM, so the phone never holds Anthropic/OpenAI/etc. keys.
- **Memory** uses the existing Brain endpoints: `GET /v1/aiia/memory`,
  `POST /v1/aiia/search`, `POST /v1/aiia/remember`, `DELETE /v1/aiia/memory/{id}`
  (all already auth'd via `x-api-key`).
- **No `~/.aiia` / `~/AIIA` on iOS** — those paths don't exist in the sandbox.
  The desktop file-based keystore, vault writes, and local chat store are gated
  to desktop; iOS uses the remote Brain (+ a minimal on-device config store).

Why thin client: it shrinks the port from "replicate the whole desktop app on
iOS" to "a focused mobile client for the Brain API," and keeps secrets minimal
(one token, not seven provider keys).

## Networking (Tailscale)

No app code — the Tailscale iOS app provides the tunnel system-wide.

1. Install Tailscale on the mini, your Mac(s), and your phone/iPad; sign all
   into the same tailnet.
2. On the mini, expose the Brain tailnet-only over HTTPS:
   `tailscale serve --bg 8100` → `https://<mini>.<tailnet>.ts.net`.
3. In the iOS app, set Brain URL = that `https://…ts.net` host and paste the
   Brain token. Use Tailscale **serve**, never **funnel** (funnel is public).

## Cross-device parity (responsive)

Same React surfaces everywhere; breakpoints drive the layout:

- **iPad / desktop:** roomy multi-pane (e.g. Memory = sidebar · graph · detail).
- **iPhone:** single column — graph as the hero, detail as a bottom sheet,
  filters behind a control, a mobile chat composer.

## Voice (must-have)

- On-device mic capture → transcription. Caveat: iOS `WKWebView`
  `MediaRecorder` support is limited; expect to need a Tauri mobile mic plugin
  or a small native capture shim rather than the desktop `getUserMedia` path.
- The Brain already exposes the building blocks: journaling capture pipeline,
  `/v1/aiia/voice`, `/v1/aiia/tts`, `/v1/aiia/speak`. TTS can read responses
  back on the phone.

## Phasing

- **M0 — mobile-ready groundwork (no Mac needed):** platform-aware storage with
  `#[cfg(mobile)]` / `#[cfg(desktop)]` guards (desktop behavior unchanged),
  responsive layout for chat + memory, mobile `tauri.conf.json`, this doc.
  Desktop `npm run build` stays green; iOS Rust validates on macOS.
- **M1 — first run (your Mac):** add Rust iOS targets, `tauri ios init`, build
  to Simulator, then to a device with Tailscale for the real remote test.
- **M2 — polish:** voice capture, response TTS, signing / TestFlight, optional
  offline cache.

## Runbook (on your Mac)

Prerequisites: macOS, Xcode + Command Line Tools, an Apple ID (free works for
personal-device sideloading with a 7-day re-sign limit; the $99/yr Apple
Developer Program enables stable provisioning + TestFlight).

```bash
# 1. Rust iOS targets (once)
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios

# 2. Scaffold the Xcode project (generates src-tauri/gen/apple)
npm install
npm run tauri ios init

# 3. Run in the Simulator (fastest inner loop)
npm run tauri ios dev

# 4. Run on a physical device
#    - open the generated Xcode project, set your Team/signing once:
open src-tauri/gen/apple/aiia-console.xcodeproj
#    - then build to the device from Xcode, or:
npm run tauri ios dev --host    # device on same network/tailnet

# 5. Reach the Brain from the device
#    - install the Tailscale app on the phone, join the tailnet
#    - on the mini: tailscale serve --bg 8100
#    - in the app Settings → Connection: Brain URL = https://<mini>.<tailnet>.ts.net, paste token
```

Notes:
- Unsigned/dev builds expire (free Apple ID = 7 days); re-run `tauri ios dev`
  or rebuild from Xcode to refresh. The Developer Program removes this friction.
- The Simulator can talk to a Brain on your Mac directly (`http://localhost:8100`)
  for UI iteration without Tailscale; the device needs Tailscale.
