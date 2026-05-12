import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import { invoke } from "@tauri-apps/api/core";

import { Canvas, connectEdge } from "./components/Canvas";
import { LeftRail } from "./components/LeftRail";
import { NodeInspector } from "./components/NodeInspector";
import { NodePalette } from "./components/NodePalette";
import { SettingsModal } from "./components/SettingsModal";
import { ChatTab } from "./components/ChatTab";
import type { AppNode, FlowNodeData, NodeKind } from "./types";
import { defaultDataFor, stripRuntime } from "./types";
import { runFlow, writeSession, type NodeUpdate } from "./executor";
import "./App.css";

const DEFAULT_FLOW = "untitled.flow.json";
const DEV_MODE_KEY = "aiia-console-dev-mode";
const ACTIVE_TAB_KEY = "aiia-console-active-tab";

type TabId = "chat" | "memory" | "dev";

type FlowFile = {
  version: 1;
  nodes: AppNode[];
  edges: Edge[];
  viewport: Viewport;
};

function nextId(prefix: NodeKind, existing: AppNode[]): string {
  let i = 1;
  while (existing.some((n) => n.id === `${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}

function readDevMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEV_MODE_KEY) === "true";
}

function readActiveTab(devMode: boolean): TabId {
  if (typeof window === "undefined") return "chat";
  const raw = window.localStorage.getItem(ACTIVE_TAB_KEY);
  if (raw === "chat" || raw === "memory") return raw;
  if (raw === "dev" && devMode) return "dev";
  return "chat";
}

function App() {
  const [devMode, setDevMode] = useState<boolean>(readDevMode);
  const [activeTab, setActiveTab] = useState<TabId>(() => readActiveTab(readDevMode()));
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Persist devMode + activeTab to localStorage.
  useEffect(() => {
    window.localStorage.setItem(DEV_MODE_KEY, devMode ? "true" : "false");
    // If devMode is turned off while on the dev tab, bounce to chat.
    if (!devMode && activeTab === "dev") {
      setActiveTab("chat");
    }
  }, [devMode, activeTab]);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  // Listen for cross-component devMode flips (Settings modal toggle).
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      if (typeof next === "boolean") setDevMode(next);
    };
    window.addEventListener("aiia-console:dev-mode", handler);
    return () => window.removeEventListener("aiia-console:dev-mode", handler);
  }, []);

  // ---- Canvas state (only used when devMode + dev tab) ----
  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flows, setFlows] = useState<string[]>([]);
  const [currentFlow, setCurrentFlow] = useState<string>(DEFAULT_FLOW);
  const [status, setStatus] = useState<string>("ready");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const nodesRef = useRef<AppNode[]>([]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const refreshFlows = useCallback(async () => {
    try {
      const list = await invoke<string[]>("list_flows");
      setFlows(list);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (devMode) refreshFlows();
  }, [devMode, refreshFlows]);

  const onNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [],
  );

  const onConnect = useCallback((conn: Parameters<typeof connectEdge>[1]) => {
    setEdges((eds) => connectEdge(eds, conn));
  }, []);

  const addNode = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }) => {
      setNodes((nds) => {
        const id = nextId(kind, nds);
        const pos = position ?? {
          x: 80 + nds.length * 30,
          y: 80 + nds.length * 30,
        };
        const node = {
          id,
          type: kind,
          position: pos,
          data: defaultDataFor(kind),
        } as AppNode;
        return [...nds, node];
      });
    },
    [],
  );

  const updateNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? ({ ...n, data: { ...n.data, ...patch } as FlowNodeData } as AppNode)
            : n,
        ),
      );
    },
    [],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
    },
    [],
  );

  const baseName = (name: string) => name.replace(/\.flow\.json$/, "");

  const save = useCallback(async () => {
    setError(null);
    setStatus("saving…");
    const persistedNodes = nodes.map((n) => ({
      ...n,
      data: stripRuntime(n.data) as typeof n.data,
    })) as AppNode[];
    const payload: FlowFile = {
      version: 1,
      nodes: persistedNodes,
      edges,
      viewport,
    };
    try {
      const path = await invoke<string>("save_flow", {
        name: baseName(currentFlow),
        contents: JSON.stringify(payload, null, 2),
      });
      setStatus(`saved → ${path}`);
      refreshFlows();
    } catch (e) {
      setError(String(e));
      setStatus("save failed");
    }
  }, [nodes, edges, viewport, currentFlow, refreshFlows]);

  const load = useCallback(
    async (name: string) => {
      setError(null);
      setStatus(`loading ${name}…`);
      try {
        const raw = await invoke<string>("load_flow", {
          name: baseName(name),
        });
        const parsed = JSON.parse(raw) as Partial<FlowFile>;
        setNodes((parsed.nodes ?? []) as AppNode[]);
        setEdges((parsed.edges ?? []) as Edge[]);
        if (parsed.viewport) setViewport(parsed.viewport);
        setCurrentFlow(name);
        setSelectedId(null);
        setStatus(`loaded ${name}`);
      } catch (e) {
        setError(String(e));
        setStatus("load failed");
      }
    },
    [],
  );

  const handleAddFromPalette = useCallback(
    (kind: NodeKind) => addNode(kind),
    [addNode],
  );

  const applyUpdate = useCallback((u: NodeUpdate) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== u.id) return n;
        const data = { ...n.data } as FlowNodeData & {
          _output?: string;
          _status?: typeof u.status;
          _error?: string;
        };
        if (u.status) data._status = u.status;
        if (u.error) data._error = u.error;
        if (u.output !== undefined) data._output = u.output;
        if (u.appendToken !== undefined) {
          data._output = (data._output ?? "") + u.appendToken;
        }
        return { ...n, data } as AppNode;
      }),
    );
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    setError(null);
    if (nodes.length === 0) { setError("nothing to run — add some nodes first"); return; }
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...stripRuntime(n.data),
          _status: "idle",
          _output: "",
          _error: undefined,
        } as FlowNodeData,
      })) as AppNode[],
    );
    setRunning(true);
    setStatus("running…");
    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = new Date().toISOString();
    try {
      const result = await runFlow(nodes, edges, {
        onUpdate: applyUpdate,
        signal: controller.signal,
      });
      const endedAt = new Date().toISOString();
      setStatus(`run complete (${result.order.length} nodes)`);
      try {
        const sessionPath = await writeSession({
          flowName: currentFlow,
          startedAt,
          endedAt,
          outputs: result.outputs,
          nodes: nodesRef.current,
        });
        setStatus(`run complete · session → ${sessionPath.replace(/^.*AIIA\//, "")}`);
      } catch (e) {
        setStatus("run complete · session write failed");
        setError(String(e));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("run failed");
      setError(msg);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [running, nodes, edges, currentFlow, applyUpdate]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus("cancelling…");
  }, []);

  // ---- Tab navigation buttons ----
  const tabs: { id: TabId; label: string }[] = [
    { id: "chat", label: "Chat" },
    { id: "memory", label: "Memory" },
    ...(devMode ? [{ id: "dev" as const, label: "Dev" }] : []),
  ];

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold tracking-tight">
            <span aria-hidden className="mr-1.5 text-neutral-400">⌬</span>
            AIIA Console
          </span>
          {activeTab === "dev" && (
            <span className="ml-3 rounded bg-neutral-900 px-2 py-0.5 font-mono text-[11px] text-neutral-400">
              {baseName(currentFlow)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "dev" && (
            <span className="text-[11px] text-neutral-500">{status}</span>
          )}
          {activeTab === "dev" && (running ? (
            <button
              type="button"
              onClick={cancel}
              className="rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-500"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={run}
              className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-medium text-neutral-950 hover:bg-emerald-400"
            >
              ▶ Run
            </button>
          ))}
          {activeTab === "dev" && (
            <>
              <button
                type="button"
                onClick={save}
                disabled={running}
                className="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => load(currentFlow)}
                disabled={running}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs hover:border-neutral-500 disabled:opacity-50"
              >
                Load
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 hover:text-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <nav
        role="tablist"
        aria-label="Console sections"
        className="flex items-center gap-1 border-b border-neutral-800 px-4"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={
              "border-b-2 px-3 py-2 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 " +
              (activeTab === t.id
                ? "border-emerald-500 text-neutral-100"
                : "border-transparent text-neutral-400 hover:text-neutral-200")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && activeTab === "dev" && (
        <div className="border-b border-red-900/50 bg-red-950/30 px-5 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        devMode={devMode}
        onDevModeChange={setDevMode}
      />

      {/* Tab body */}
      <div className="flex min-h-0 flex-1">
        {activeTab === "chat" && <ChatTab />}

        {activeTab === "memory" && (
          <div className="flex flex-1 items-center justify-center text-neutral-500">
            <div className="text-sm">Memory tab — coming online…</div>
          </div>
        )}

        {activeTab === "dev" && devMode && (
          <>
            <LeftRail
              flows={flows}
              currentFlow={currentFlow}
              onSelect={(f) => load(f)}
              onRefresh={refreshFlows}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <NodePalette onAdd={handleAddFromPalette} />
              <div className="min-h-0 flex-1">
                <Canvas
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onSelect={setSelectedId}
                  onAddNode={addNode}
                  onViewportChange={setViewport}
                  defaultViewport={viewport}
                />
              </div>
            </div>
            <NodeInspector
              node={selectedNode}
              onChange={updateNodeData}
              onDelete={deleteNode}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default App;
