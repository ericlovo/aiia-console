# CLAUDE.md — Agent Context for AIIA Console

This file orients a coding agent landing in this repo. Read `README.md` for product framing, `BUILD.md` for build instructions, and this doc for *how the code is laid out and how to work with it*.

## What this repo is

`ericlovo/aiia-console` — the **desktop app**: a Tauri 2 + React 19 + TypeScript application that gives the AIIA Brain a local chat UI, memory graph visualization, and a flow-canvas dev surface. Ships bundled Ollama, persists secrets via a Rust keystore, streams from multiple LLM providers (Anthropic, OpenAI, Google, DeepSeek, Moonshot).

The companion repo `ericlovo/aiia` (the Brain) runs the FastAPI service this console optionally talks to at `localhost:8100`. The console works without it (SQLite fallback for memory).

## Stack

| Layer | Tech |
|---|---|
| Native shell | Tauri 2 (Rust) |
| Frontend | React 19 + TypeScript 5.8 + Vite 7 |
| Styles | Tailwind CSS 4.3 (CSS-first via `@import "tailwindcss"`) |
| Memory viz | `react-force-graph-2d` |
| Canvas | `@xyflow/react` |

## Layout

```
src/                                # React app
├── App.tsx                         # Tab router (Chat / Memory / Dev)
├── main.tsx                        # Vite entry
├── App.css                         # Single `@import "tailwindcss";` line
├── brain/
│   └── client.ts                   # Talks to AIIA Brain at :8100
├── components/
│   ├── ChatTab.tsx                 # Streaming chat surface
│   ├── MemoryTab.tsx               # Force-graph view
│   ├── DevTab.tsx                  # xyflow canvas
│   ├── SettingsModal.tsx           # API key entry + appearance + dev toggle
│   └── memory/                     # MemoryGraph, MemorySidebar, MemoryDetail, AddMemoryModal
├── providers/                      # Multi-LLM streaming abstractions
├── executor.ts
├── types.ts
└── _legacy/                        # Pre-redesign chat surface, preserved for reference

src-tauri/                          # Rust backend
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── keystore.rs                 # OS keychain wrapper for provider API keys
│   └── brain.rs                    # Brain HTTP client + commands
└── tauri.conf.json                 # Window, bundle, identifier config

.github/                            # CI + Dependabot (PR #3) + workflow files
public/                             # Static assets
```

## Dev commands

```bash
# Install JS deps
npm install

# Frontend-only (no native shell, useful in headless envs)
npm run build    # tsc + vite build → dist/
npm run dev      # vite dev server

# Native desktop (needs Rust + Xcode CLT on macOS)
npm run tauri dev
npm run tauri build

# Tests (placeholder until T1 lands vitest)
npm test
```

See `BUILD.md` for the full macOS build + unsigned-Gatekeeper workflow.

## Linting + typecheck

No eslint config — TypeScript's `strict` + `noUnusedLocals` + `noUnusedParameters` in `tsconfig.json` is the linter. `npm run build` runs `tsc` first, so typecheck failures are build failures.

If a real lint step is wanted later, `biome` is a good fit (single binary, fast, formatter+linter combined).

## Testing

Currently **no tests** (the placeholder `npm test` script exits 0 with a notice).

Track 2 in the 24h plan lands:
- **T1** — vitest + `@testing-library/react`, smoke test for App.tsx tab routing
- **T2** — `src/brain/client.ts` with mocked `fetch`
- **T3** — `SettingsModal` with mocked Tauri `invoke` for the keystore

## Conventions

### Commits

Conventional Commits — examples from the log:

```
feat: unified aiia CLI ...
docs: rewrite README for consumer-first product framing
chore: remove supermemory integration
ci: bootstrap GitHub Actions workflow
refactor: move canvas into dev tab
```

Prefixes: `feat`, `fix`, `docs`, `chore`, `ci`, `refactor`, `test`, `design`, `release`, `app`, `deps`, `tauri`.

### Branches

- `main` — protected (or about to be)
- `claude/<slug>-sjym0` — agent-created working branches
- `feat/<slug>` — feature branches (most absorbed into main; see PR #1)
- `docs/<slug>` — doc-only branches

## Talking to the Brain

`src/brain/client.ts` is the integration boundary. It probes `localhost:8100` on startup; if the Brain is reachable, the Memory tab uses real data. If not, the app falls back to local SQLite (via Tauri's filesystem APIs). Status pill in the title bar reflects which mode is active.

When testing brain-dependent flows in CI or dev without a Brain running, the SQLite fallback is the contract — don't break it.

## Native side — what the Rust does

| Module | Purpose |
|---|---|
| `keystore.rs` | OS-keychain-backed storage for provider API keys. Don't log raw keys; use the `redacted` wrappers. |
| `brain.rs` | HTTP client + Tauri commands exposed to the React side for Brain calls. |
| `main.rs` | App entry; registers commands and the Tauri plugin set. |
| `lib.rs` | Module wiring. |

If you add a new Tauri command, follow the existing pattern in `brain.rs` (typed inputs + outputs, `#[tauri::command]` annotation, register in `main.rs`'s `.invoke_handler`).

## Design language

Source of truth: this repo. `aiia/design/tokens.json` mirrors what's used here. Currently dark-first neutral surface (`neutral-900` base) with emerald primary accent (`ring-emerald-500` is the focus ring). When you change the theme, propose a matching update to `aiia/design/tokens.json` in the same flight.

## Common gotchas

- **`npm run tauri dev` needs a display + Rust + (on macOS) Xcode CLT.** In headless CI, only `npm run build` is meaningful — the `rust` job in `ci.yml` runs `cargo check` without the windowing layer.
- **Unsigned builds trip Gatekeeper.** Right-click → Open on first launch, or `xattr -dr com.apple.quarantine <path>.app`. The Apple Developer cert is currently lapsed — see BUILD.md for the path to re-enable signing.
- **Tailwind 4 is CSS-first.** Theme overrides go in CSS via `@theme { ... }`, not in a `tailwind.config.js`. There isn't currently a custom theme — the app uses Tailwind defaults.
- **Cargo cache misses are expensive in CI.** The `Swatinem/rust-cache@v2` action is already wired in `ci.yml`; don't disable it without a reason.
