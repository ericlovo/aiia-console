# CLAUDE.md — Agent Context for AIIA Console

This file orients a coding agent landing in this repo. Read `README.md` for product framing, `BUILD.md` for build instructions, and this doc for *how the code is laid out and how to work with it*.

## What this repo is

`ericlovo/aiia-console` — the **desktop app**: a Tauri 2 + React 19 + TypeScript application that gives the AIIA Brain a local chat surface and memory graph view. Persists API keys via a hardened Rust keystore (URL allowlist, no JS read-back), streams from multiple LLM providers (Anthropic, OpenAI, Google, DeepSeek, Moonshot, Ollama, MLX).

The companion repo `ericlovo/aiia` (the Brain) runs the FastAPI service this console optionally talks to at `localhost:8100`. The console works without it (SQLite fallback for memory).

## Stack

| Layer | Tech |
|---|---|
| Native shell | Tauri 2 (Rust) |
| Frontend | React 19 + TypeScript 5.8 + Vite 7 |
| Styles | Tailwind CSS 4.3 (CSS-first via `@import "tailwindcss"`) |
| Memory viz | `react-force-graph-2d` |
| Tests | vitest 4 + `@testing-library/react` + jsdom |

## Layout

```
src/                                # React app
├── App.tsx                         # Two-view shell: chat | memory (corner-chrome nav)
├── main.tsx                        # Vite entry
├── App.css                         # `@import "tailwindcss";` + vellum/ink theme tokens
├── brain/
│   └── client.ts                   # Talks to AIIA Brain at :8100; SQLite fallback
├── components/
│   ├── ChatTab.tsx                 # Streaming chat surface (the primary view)
│   ├── MemoryTab.tsx               # Force-graph view (Brain-backed when reachable)
│   ├── SettingsModal.tsx           # API keys, appearance, vault path
│   └── memory/                     # MemoryGraph, MemorySidebar, MemoryDetail, AddMemoryModal
├── providers/                      # Multi-LLM streaming abstractions
│   ├── index.ts                    # provider:model id parsing + dispatch
│   ├── index.test.ts               # 14 unit tests (parse/format/normalize helpers)
│   ├── keystoreStream.ts           # Routes provider calls through the Rust keystore
│   └── {anthropic,openai,google,deepseek,moonshot,ollama,mlx}.ts
├── test/setup.ts                   # vitest + jest-dom wiring
├── styles/                         # Shared Tailwind utility classes
└── _legacy/                        # Pre-redesign chat surface, kept for reference

src-tauri/                          # Rust backend
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── keystore.rs                 # OS-keychain wrapper + URL allowlist (#8)
│   └── brain.rs                    # Brain HTTP client + Tauri commands
└── tauri.conf.json                 # Window, bundle, identifier config

.github/
├── workflows/
│   ├── ci.yml                      # frontend (tsc + vite + vitest) + rust (cargo check)
│   ├── security.yml                # npm audit + cargo audit (weekly cron)
│   └── gitleaks.yml                # Daily secret scan (CLI, not the action wrapper)
└── dependabot.yml                  # Weekly Mon — npm, cargo, github-actions
```

## Dev commands

```bash
# Install JS deps
npm install

# Frontend-only (no native shell, useful in headless envs)
npm run build           # tsc + vite build → dist/
npm run dev             # vite dev server

# Native desktop (needs Rust + Xcode CLT on macOS)
npm run tauri dev
npm run tauri build

# Tests
npm test                # vitest run (CI uses this)
npm run test:watch      # vitest, watch mode
npm run test:coverage   # vitest run --coverage (v8)
```

See `BUILD.md` for the full macOS build + unsigned-Gatekeeper workflow.

## Linting + typecheck

No eslint config — TypeScript's `strict` + `noUnusedLocals` + `noUnusedParameters` in `tsconfig.json` is the linter. `npm run build` runs `tsc` first, so typecheck failures are build failures.

If a real lint step is wanted later, `biome` is a good fit (single binary, fast, formatter+linter combined).

## Testing

Live: **9 unit tests** in `src/providers/index.test.ts` covering provider:model id parsing, formatting, and normalization. Run with `npm test`.

Good targets for future tests (none written yet):
- `src/brain/client.ts` with mocked `fetch` — covers the SQLite-fallback contract
- `SettingsModal` with mocked Tauri `invoke` for the keystore
- `App.tsx` smoke test for view-switching state persistence

The CI workflow runs `npm test` on every PR — adding a broken test fails the build.

## Conventions

### Commits

Conventional Commits — examples from the log:

```
feat(console): apply AIIA Design System tokens across all surfaces
fix(console): ESC closes Settings + clearer close affordance
refactor(console): collapse top nav to wordmark + corner chrome
ci: bootstrap GitHub Actions workflow
chore(console): retire canvas + Dev tab
```

Prefixes: `feat`, `fix`, `docs`, `chore`, `ci`, `refactor`, `test`, `design`, `release`, `deps`, `tauri`.

### Branches

- `main` — current
- `claude/<slug>-<short-id>` — agent-created working branches
- `feat/<slug>` — feature branches
- `docs/<slug>` — doc-only branches

## Talking to the Brain

`src/brain/client.ts` is the integration boundary. It probes `localhost:8100` on startup; if the Brain is reachable, the Memory tab uses real data. If not, the app falls back to local SQLite (via Tauri's filesystem APIs). Status pill in the title bar reflects which mode is active.

When testing brain-dependent flows in CI or dev without a Brain running, the SQLite fallback is the contract — don't break it.

## Native side — what the Rust does

| Module | Purpose |
|---|---|
| `keystore.rs` | OS-keychain-backed storage for provider API keys. **URL allowlist** rejects non-https or off-allowlist hosts before the key is loaded — defense-in-depth against XSS-equivalent JS bugs. Don't log raw keys. |
| `brain.rs` | HTTP client + Tauri commands exposed to the React side for Brain calls. |
| `main.rs` | App entry; registers commands and the Tauri plugin set. |
| `lib.rs` | Module wiring. |

If you add a new Tauri command, follow the existing pattern in `brain.rs` (typed inputs + outputs, `#[tauri::command]` annotation, register in `main.rs`'s `.invoke_handler`).

If you add a new LLM provider, also add its API host to the `allowed_hosts` function in `keystore.rs` — otherwise the keystore will refuse to attach the key.

## Design language

Current palette: **vellum + ink** (warm cream surface, deep ink-900 text, serif display type for the wordmark). See `App.css` for the `@theme` block and `src/styles/` for shared utility classes.

Source of truth for tokens: this repo. `aiia/design/tokens.json` mirrors what's used here. When you change the theme, propose a matching update to `aiia/design/tokens.json` in the same flight.

## Common gotchas

- **`npm run tauri dev` needs a display + Rust + (on macOS) Xcode CLT.** In headless CI, only `npm run build` is meaningful — the `rust` job in `ci.yml` runs `cargo check` without the windowing layer.
- **Unsigned builds trip Gatekeeper.** Right-click → Open on first launch, or `xattr -dr com.apple.quarantine <path>.app`. The Apple Developer cert is currently lapsed — see BUILD.md for the path to re-enable signing.
- **Tailwind 4 is CSS-first.** Theme overrides live in `App.css` via `@theme { ... }`, not in a `tailwind.config.js`.
- **Cargo cache misses are expensive in CI.** The `Swatinem/rust-cache@v2` action is already wired; don't disable without a reason.
- **Adding a provider needs two files in sync** — the TypeScript provider in `src/providers/` AND the host allowlist in `src-tauri/src/keystore.rs::allowed_hosts`.
