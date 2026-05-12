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
import type { AppNode, FlowNodeData, NodeKind } from "./types";
import { defaultDataFor, stripRuntime } from "./types";
import { runFlow, writeSession, type NodeUpdate } from "./executor";
import "./App.css";

const DEFAULT_FLOW = "untitled.flow.json";

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

function App() {
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

  // Ref-mirror so the executor's onUpdate callback can see latest nodes.
  const nodesRef = useRef<AppNode[]>([]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  // ---- Flow list ----
  const refreshFlows = useCallback(async () => {
    try {
      const list = await invoke<string[]>("list_flows");
      setFlows(list);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refreshFlows();
  }, [refreshFlows]);

  // ---- Graph mutations ----
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

  // ---- Save / Load ----
  const baseName = (name: string) => name.replace(/\.flow\.json$/, "");

  const save = useCallback(async () => {
    setError(null);
    setStatus("saving…");
    // Strip runtime fields before persisting.
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

  // ---- Run / Cancel ----
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
    // Reset runtime state.
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
          // Use the latest node state for prompts/labels in the session writeup.
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

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold tracking-tight">AIIA</span>
          <span className="text-xs text-neutral-500">console</span>
          <span className="ml-3 rounded bg-neutral-900 px-2 py-0.5 font-mono text-[11px] text-neutral-400">
            {baseName(currentFlow)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500">{status}</span>
          {running ? (
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
          )}
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
        </div>
      </header>

      {error && (
        <div className="border-b border-red-900/50 bg-red-950/30 px-5 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
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
      </div>
    </div>
  );
}

export default App;
