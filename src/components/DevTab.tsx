// DevTab — the existing 3-pane canvas workspace. Off by default; surfaced
// only when developer mode is enabled in Settings.
//
// This component owns the full canvas state and toolbar (Run/Cancel/Save/
// Load), so the consumer-facing tabs stay completely free of canvas concerns.

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

import { Canvas, connectEdge } from "./Canvas";
import { LeftRail } from "./LeftRail";
import { NodeInspector } from "./NodeInspector";
import { NodePalette } from "./NodePalette";
import type { AppNode, FlowNodeData, NodeKind } from "../types";
import { defaultDataFor, stripRuntime } from "../types";
import { runFlow, writeSession, type NodeUpdate } from "../executor";

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

export function DevTab() {
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
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

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
    void refreshFlows();
  }, [refreshFlows]);

  const onNodesChange = useCallback((changes: NodeChange<AppNode>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback((conn: Parameters<typeof connectEdge>[1]) => {
    setEdges((eds) => connectEdge(eds, conn));
  }, []);

  const addNode = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }) => {
      setNodes((nds) => {
        const id = nextId(kind, nds);
        const pos =
          position ?? { x: 80 + nds.length * 30, y: 80 + nds.length * 30 };
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
            ? ({
                ...n,
                data: { ...n.data, ...patch } as FlowNodeData,
              } as AppNode)
            : n,
        ),
      );
    },
    [],
  );

  const deleteNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
  }, []);

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
      void refreshFlows();
    } catch (e) {
      setError(String(e));
      setStatus("save failed");
    }
  }, [nodes, edges, viewport, currentFlow, refreshFlows]);

  const load = useCallback(async (name: string) => {
    setError(null);
    setStatus(`loading ${name}…`);
    try {
      const raw = await invoke<string>("load_flow", { name: baseName(name) });
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
  }, []);

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
    if (nodes.length === 0) {
      setError("nothing to run — add some nodes first");
      return;
    }
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
        setStatus(
          `run complete · session → ${sessionPath.replace(/^.*AIIA\//, "")}`,
        );
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Canvas-only toolbar */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-1.5">
        <div className="flex items-center gap-2">
          <span className="rounded bg-neutral-900 px-2 py-0.5 font-mono text-[11px] text-neutral-400">
            {baseName(currentFlow)}
          </span>
          <span className="text-[11px] text-neutral-500">{status}</span>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

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
