# Changelog

All notable changes to AIIA Console will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-07-21

### Added
- **Today** home view: standup brief, backlog-steward report, code-review
  findings, loop-status pills, and a "Compute spent today" panel (local vs
  cloud tokens with per-purpose breakdown in plain language)
- **Memory workbench**: dense table view of the whole store as the primary
  Memory surface — substring filter, date-range chips (24h/7d/30d/All),
  real timestamps per row, newest-first timeline, bulk forget. The 3D globe
  demotes to an optional "Graph" toggle
- **Loops** tab: live view of the M4's scheduled ops loops from `/v1/loops`
  — last run, status, output, click-through to the vault note
- Purpose-attributed token observability wired through to the Today panel

### Changed
- Default view is now Today, not Chat; Chat gets its own corner icon

## [Unreleased]

### Added
- Multi-provider model support: Anthropic, OpenAI, Moonshot (Kimi), DeepSeek,
  Google Gemini, alongside local Ollama
- Secure keystore for remote provider API keys (Rust-side, never exposed to
  JavaScript)
- Settings modal for managing provider keys per provider
- Grouped model picker (Local / Remote) with key-availability hints
- MLX provider scaffold (not yet implemented)
- Open-source hygiene: `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `CHANGELOG.md`, PR template

### Changed
- Repository renamed from `aiia-app` to `aiia-console`
- Agent node model identifier changed from a plain string to
  `provider:model` (e.g. `ollama:qwen3:14b`, `anthropic:claude-opus-4-7`)
- Executor refactored to use the provider registry instead of a hardcoded
  Ollama path

## [0.1.0] - 2026-05-09

### Added
- Initial Tauri 2 + React 19 + Vite 7 + TypeScript 5.8 + Tailwind v4 stack
- React Flow canvas with three node types: Agent, VaultRead, VaultWrite
- Topo-walk streaming executor against the local Ollama daemon
- Flow save/load to `~/AIIA/Flows/*.flow.json`
- Vault read/write Tauri commands sandboxed to `~/AIIA`
- Ollama model picker pulling live from the local daemon
- Three-pane shell: LeftRail (flow list) · Canvas · NodeInspector
- Run / Cancel buttons with session write on completion
- Live node output panel and status dot
