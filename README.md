# AIIA Console

> Your local AI, transparently.

The desktop app that bundles a local AI, shows you what it remembers, and
never sends your data anywhere.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24c8d8.svg)](https://tauri.app)
[![Status: pre-release](https://img.shields.io/badge/status-pre--release-orange.svg)](#status)

---

## What this is

AIIA Console is a desktop app for talking to AI on your own machine. It
bundles [Ollama](https://ollama.com) under the hood, downloads a small model
on first launch, and gets you chatting in about three minutes — no terminal,
no API key, no account.

When you want more, you can plug in remote providers (Anthropic, OpenAI,
Google, DeepSeek, Moonshot) using your own API keys. The keys stay on your
machine, in a Rust-managed keystore, never exposed to the JavaScript layer.

When you want even more, you can pair it with
[AIIA](https://github.com/ericlovo/AIIA) — the local-first memory and
autonomy platform — and Console becomes the visual front-end for your AI's
persistent memory.

## Why this exists

Most AI apps are one of:

- **Cloud-only** (ChatGPT, Claude): great UX, your data leaves your machine,
  you pay tokens forever.
- **Local but engineery** (LM Studio, Open WebUI, Anything-LLM): assume you
  know what quantization is, what Docker is, what an embedding model is.
- **Local and accessible but shallow** (Jan, GPT4All): chat works, but there's
  no memory story, no transparency about what the model knows about you.

We wanted the experience of AirPods for AI: open the box, it works. Plus the
thing nobody else does: **show you exactly what your AI remembers about you,
and let you edit or delete any of it.**

## Three pillars (the moat)

1. **Just works.** Bundle Ollama, download a model on first launch, chat.
   Zero terminal. Zero docs you have to read.
2. **Memory you can see.** Force-directed graph of every fact your AI has
   stored about you. Read, edit, forget, export. (Coming in the Memory tab —
   powered by AIIA Brain when available; local SQLite fallback when not.)
3. **Yours.** MIT licensed. Local-first. Optional cloud providers via your
   own keys. No telemetry, no accounts, no servers we run.

## The three tabs

- **Chat** (default) — clean conversation surface, model picker, file
  attachments, "remember this" toggle.
- **Memory** — the visualization. The thing you'll screenshot.
- **Dev** (off by default, toggle in Settings) — visual flow canvas,
  multi-provider routing, custom node types, the whole engineery side. For
  builders.

## Status

**Pre-release. Actively developed.** Built on Tauri 2, React 19, TypeScript
5.8, React Flow 12. Tested on macOS Apple Silicon.

- ✅ Visual flow canvas (will become "Dev" tab)
- ✅ Multi-provider streaming (Ollama, Anthropic, OpenAI, Google, DeepSeek,
  Moonshot)
- ✅ Secure keystore for API keys
- ✅ Flow save/load to disk
- 🚧 Chat-first landing surface (next)
- 🚧 Memory visualization tab (next)
- 🚧 First-run model download wizard (next)
- 🚧 Ollama sidecar bundling (next)
- 📋 Recipes drawer (planned)
- 📋 MLX provider (scaffold present, implementation planned)

## Requirements

- **macOS Apple Silicon** — primary target. Tauri 2 builds for Linux and
  Windows, but those paths aren't exercised here yet.
- **Node 24+** and **Rust stable** (for building from source)
- **Optional:** [AIIA](https://github.com/ericlovo/AIIA) running on
  `localhost:8100` for memory-augmented features.
  [Ollama](https://ollama.com) on `localhost:11434` for local-model chat
  (eventually bundled as a sidecar).

## Quick start (development)

```bash
git clone https://github.com/ericlovo/aiia-console.git
cd aiia-console
npm install
npm run tauri dev    # spawns a desktop window
```

For CI / headless validation:

```bash
npm run build                            # tsc + vite
cd src-tauri && cargo build --lib        # Rust compile
```

## Providers

| Provider | ID | Kind | Auth |
|---|---|---|---|
| Ollama | `ollama` | Local | none (daemon on :11434) |
| Anthropic | `anthropic` | Remote | API key via keystore |
| OpenAI | `openai` | Remote | API key via keystore |
| Google Gemini | `google` | Remote | API key via keystore |
| DeepSeek | `deepseek` | Remote | API key via keystore |
| Moonshot (Kimi) | `moonshot` | Remote | API key via keystore |
| MLX | `mlx` | Local | (scaffold only) |

Adding a provider: implement the `Provider` interface in
`src/providers/types.ts`, drop a file in `src/providers/`, register it in
`src/providers/index.ts`. The keystore proxy handles the secure key path
automatically for remote providers.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                       AIIA Console                             │
│                                                                │
│   ┌─────────┐    ┌──────────┐    ┌──────────────────┐          │
│   │  Chat   │    │  Memory  │    │  Dev (canvas)    │          │
│   └────┬────┘    └─────┬────┘    └────────┬─────────┘          │
│        │               │                  │                    │
│        └───────────────┼──────────────────┘                    │
│                        ▼                                       │
│   ┌────────────────────────────────────────────┐               │
│   │      Provider Registry (TypeScript)        │               │
│   └──────┬─────────────────────┬───────────────┘               │
│          │                     │                               │
│          ▼                     ▼                               │
│   ┌──────────────┐      ┌──────────────────┐                   │
│   │ Ollama       │      │ Keystore proxy   │                   │
│   │ (bundled)    │      │ (Rust)           │                   │
│   └──────┬───────┘      └────────┬─────────┘                   │
│          │                       │                             │
└──────────┼───────────────────────┼─────────────────────────────┘
           │                       │
           ▼                       ▼
   ┌───────────────┐       ┌──────────────────────┐
   │ llama.cpp     │       │ Remote APIs          │
   │ (local model) │       │ (Anthropic, OpenAI,  │
   └───────────────┘       │  Google, DeepSeek,   │
                           │  Moonshot)           │
                           └──────────────────────┘

           Optional: AIIA Brain on localhost:8100
           for memory-augmented features
```

## Related projects

- **[AIIA](https://github.com/ericlovo/AIIA)** — the memory + autonomy
  platform Console pairs with. Apache 2.0.
- **[Ollama](https://ollama.com)** — local LLM runtime Console bundles.
- **[Tauri](https://tauri.app)** — the desktop framework.
- **[React Flow](https://reactflow.dev)** — the canvas (Dev mode).

## Roadmap

Near-term (next 4–6 weeks):

- Chat-first landing surface
- Ollama sidecar bundling + first-run model download wizard
- Memory visualization tab (force-directed graph, AIIA Brain integration)
- Recipes drawer (one-click setups from *The Local Loop* newsletter)

Mid-term:

- MLX provider (Apple Silicon native, faster than Ollama on M-series)
- Coding surface (file tree + editor + diff view + agent-can-edit-files)
- MCP client support (Console as MCP client, plus exposing flows as MCP tools)
- Linux + Windows builds

## License

MIT. See [LICENSE](./LICENSE).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Bug reports, new providers, canvas
node types, and UI polish are all welcome.

Security disclosures: see [SECURITY.md](./SECURITY.md). Please don't file
public issues for vulnerabilities.

## Author

Built by [Eric Lovold](https://github.com/ericlovo) on a Mac mini in
Minnesota. Part of the AIIA platform. Powered by local models, your own
API keys when you want them, and zero telemetry.
