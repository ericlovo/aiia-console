# AIIA Console

A visual cockpit for AIIA. Tauri v2 + React 19 + Vite 7 + TypeScript 5.8 + Tailwind v4 + [React Flow](https://reactflow.dev/) (`@xyflow/react`).

This is the desktop app shell that pairs with the local `aiia-brain` HTTP service and the Obsidian vault at `~/AIIA`. The original single-screen chat surface is preserved at `src/_legacy/Chat.tsx` for reference; the main app is now a node-based canvas.

## Status

P0 — **Canvas scaffold (visual only).** Build flows out of three node types, save/load to `~/AIIA/Flows/*.flow.json`. No live execution yet — that lands in the streaming-bridge story (P1).

## Layout

```
┌──────────┬──────────────────────────────────────┬──────────────┐
│ LeftRail │ Palette                              │ NodeInspector│
│  flows   ├──────────────────────────────────────┤   per-node   │
│   list   │                                      │   config     │
│          │       React Flow canvas              │   form       │
│          │                                      │              │
└──────────┴──────────────────────────────────────┴──────────────┘
```

## Node types

- **Agent** — prompt textarea, model dropdown (placeholder), tools list. Has input + output pins.
- **VaultRead** — vault path + optional query. Output pin only.
- **VaultWrite** — vault path + section heading. Input pin only.

Drag from the palette onto the canvas, or click a palette button to spawn at origin.

## Save / Load

- **Save** serializes `{ version, nodes, edges, viewport }` to `~/AIIA/Flows/<name>.flow.json` via the Rust command `save_flow`.
- **Load** reads it back via `load_flow`.
- The left rail lists everything in `~/AIIA/Flows/` (refresh with ↻).

Filenames are validated against path traversal in Rust; only flat names are accepted and the `.flow.json` suffix is added if missing.

## Scripts

```sh
npm install
npm run build       # tsc + vite build (CI-safe)
npm run tauri dev   # spawns desktop window (don't run this in agent sessions)
```

## Where things live

- `src/App.tsx` — top-level shell, save/load wiring, state
- `src/components/Canvas.tsx` — React Flow wrapper, drop handling, single-input edge enforcement
- `src/components/NodePalette.tsx` — drag-source for new nodes
- `src/components/{AgentNode,VaultReadNode,VaultWriteNode}.tsx` — custom node renderers
- `src/components/NodeInspector.tsx` — right-pane form per selected node
- `src/components/LeftRail.tsx` — flow list (reads `~/AIIA/Flows/`)
- `src/types.ts` — node data shapes + placeholder model options
- `src-tauri/src/lib.rs` — `save_flow` / `load_flow` / `list_flows` commands
- `src/_legacy/Chat.tsx` — original `:8100` chat surface, not wired up

## Related

- Workstream: `~/AIIA/20-Workstreams/aiia-console.md`
- ADR: `~/AIIA/30-Decisions/ADR-007-aiia-console-direction.md`
- Story: `~/AIIA/50-Stories/P0_aiia-console-canvas-scaffold.md`
