import { useCallback, useMemo, useRef, type DragEvent } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { AgentNode } from "./AgentNode";
import { VaultReadNode } from "./VaultReadNode";
import { VaultWriteNode } from "./VaultWriteNode";
import type { AppNode, NodeKind } from "../types";
import { defaultDataFor } from "../types";

type Props = {
  nodes: AppNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onSelect: (id: string | null) => void;
  onAddNode: (kind: NodeKind, position: { x: number; y: number }) => void;
  onViewportChange: (vp: Viewport) => void;
  defaultViewport?: Viewport;
};

function CanvasInner({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelect,
  onAddNode,
  onViewportChange,
  defaultViewport,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      agent: AgentNode,
      vaultRead: VaultReadNode,
      vaultWrite: VaultWriteNode,
    }),
    [],
  );

  const handleConnect = useCallback(
    (params: Connection) => {
      // Enforce single-connection-per-target-pin: drop edges already landing on
      // the same (target, targetHandle). React Flow's `addEdge` already
      // de-dupes identical edges, but we replace any existing edge into the
      // same input.
      onConnect(params);
    },
    [onConnect],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData("application/aiia-node") as NodeKind;
      if (!kind) return;
      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      onAddNode(kind, position);
    },
    [onAddNode, screenToFlowPosition],
  );

  return (
    <div ref={wrapperRef} className="h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow<AppNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange as (changes: NodeChange<AppNode>[]) => void}
        onEdgesChange={onEdgesChange as (changes: EdgeChange[]) => void}
        onConnect={handleConnect}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        onMoveEnd={(_, vp) => onViewportChange(vp)}
        defaultViewport={defaultViewport}
        fitView={!defaultViewport}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background gap={20} size={1} color="#262626" />
        <Controls className="!border-neutral-800 !bg-neutral-900" />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(10,10,10,0.6)"
          className="!border-neutral-800 !bg-neutral-900"
          nodeColor={(n) => {
            switch (n.type) {
              case "agent":
                return "#6366f1";
              case "vaultRead":
                return "#10b981";
              case "vaultWrite":
                return "#f59e0b";
              default:
                return "#525252";
            }
          }}
        />
      </ReactFlow>
    </div>
  );
}

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

// Helper: produce an addEdge-compatible reducer with single-input enforcement.
export function connectEdge(edges: Edge[], conn: Connection): Edge[] {
  const filtered = edges.filter(
    (e) =>
      !(
        e.target === conn.target &&
        (e.targetHandle ?? null) === (conn.targetHandle ?? null)
      ),
  );
  return addEdge(conn, filtered);
}

// Re-export so callers in App can also build viewport snapshots cleanly.
export type { Viewport };
export { defaultDataFor };
