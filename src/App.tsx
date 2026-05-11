import { useCallback, useEffect, useMemo, useState } from "react";
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
import { defaultDataFor } from "./types";
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
    const payload: FlowFile = {
      version: 1,
      nodes,
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
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-900 hover:bg-white"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => load(currentFlow)}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs hover:border-neutral-500"
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
