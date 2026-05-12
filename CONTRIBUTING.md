# Contributing to AIIA Console

Thanks for your interest. AIIA Console is small, opinionated, and moves fast.
Read this before you open a PR — it'll save us both time.

## Local setup

```bash
git clone https://github.com/ericlovo/aiia-console.git
cd aiia-console
npm install
npm run tauri dev
```

> **Heads up:** `npm run tauri dev` launches a real desktop window. If you're
> on a remote/headless box, use `npm run build` + `cargo build --lib` to
> validate without the GUI.

### Prerequisites

- **macOS Apple Silicon** — primary target. Tauri 2 can build for Linux and
  Windows, but those paths aren't exercised here.
- **Node 24+**
- **Rust stable** (latest via `rustup`)
- **Optional:** [Ollama](https://ollama.com) running on `localhost:11434` for
  local-model chat. [AIIA](https://github.com/ericlovo/AIIA) running on
  `localhost:8100` for memory-augmented features.

## Filing an issue

- One bug, one issue. Include version/commit SHA, reproduction steps, and
  the actual vs. expected behavior.
- For feature requests, explain the use case first, then the proposed shape.
  We push back on features that don't fit the local-first cockpit model.

## Submitting a PR

1. Branch from `main`. Name it `feat/...`, `fix/...`, `chore/...`, `docs/...`.
2. One logical change per PR. Don't bundle a refactor with a feature.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for
   commit messages. We squash-merge when commits get noisy.
4. Both builds must be green:
   ```bash
   npm run build         # tsc + vite
   cd src-tauri && cargo build --lib
   ```
5. Update `CHANGELOG.md` under `[Unreleased]` if your change is user-facing.
6. Fill out the PR template.

## What we're looking for

- **Bug fixes** — always welcome.
- **New providers** — `src/providers/` is the extension surface. Implement
  the `Provider` interface in `src/providers/types.ts`, register it in
  `src/providers/index.ts`, and add a key entry in the Settings modal if it
  needs one.
- **New canvas node types** — `src/components/` for the React Flow node, plus
  executor wiring in `src/executor.ts`.
- **UI polish** — readability, keyboard shortcuts, accessibility, theming.
- **Docs** — README clarifications, architecture notes, provider howtos.

## What we're NOT looking for right now

- Major architecture changes without an issue + discussion first. Open an
  issue, describe the problem, get a thumbs-up, then code.
- Anything that breaks the AIIA Brain HTTP contract (the `:8100` API surface).
- Swapping the canvas library, the bundler, or the UI framework.
- New dependencies without a clear justification. The dep tree is deliberately
  small.

## Code style

- **TypeScript:** strict mode is on. Don't loosen it.
- **React:** function components + hooks. No class components.
- **Rust:** `cargo fmt` before committing. Idiomatic, no `unwrap()` on
  anything that touches user data or IPC.
- **No new global state libraries.** Lift state up, pass props, use React
  context only when you actually need it.

## Releases

Maintainer-only. We tag from `main` and let `CHANGELOG.md` drive the notes.
