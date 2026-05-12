// Force-directed memory graph. Wraps react-force-graph-2d so MemoryTab can
// stay readable. Edges are derived (today) from shared `source` strings:
// memories that come from the same place are likely about the same thing.

import { useEffect, useMemo, useRef } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";

import {
  CATEGORY_COLORS,
  deriveCategory,
  type Memory,
  type MemoryCategory,
} from "../../brain/client";

type GraphNode = {
  id: string;
  fact: string;
  category: MemoryCategory;
  size: number;
  selected: boolean;
};

type GraphLink = {
  source: string;
  target: string;
};

type Props = {
  memories: Memory[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  width: number;
  height: number;
};

function buildGraph(memories: Memory[], selectedId: string | null): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  const nodes: GraphNode[] = memories.map((m) => ({
    id: m.id,
    fact: m.fact,
    category: deriveCategory(m),
    size: 4 + Math.log10(Math.max(20, m.fact.length)) * 2,
    selected: m.id === selectedId,
  }));

  // Group by source -> link all members of a group pairwise.
  // For groups bigger than 6 we use a hub-and-spoke pattern to keep the
  // graph readable: pick the first node as the hub.
  const bySource = new Map<string, string[]>();
  for (const m of memories) {
    const key = (m.source ?? "").trim();
    if (!key) continue;
    const arr = bySource.get(key) ?? [];
    arr.push(m.id);
    bySource.set(key, arr);
  }
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  const addLink = (a: string, b: string) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source: a, target: b });
  };
  for (const ids of bySource.values()) {
    if (ids.length < 2) continue;
    if (ids.length <= 6) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          addLink(ids[i]!, ids[j]!);
        }
      }
    } else {
      const hub = ids[0]!;
      for (let i = 1; i < ids.length; i++) {
        addLink(hub, ids[i]!);
      }
    }
  }

  // Also honor metadata.links if present (array of memory ids).
  for (const m of memories) {
    const meta = m.metadata;
    if (!meta) continue;
    const linksField = (meta as Record<string, unknown>).links;
    if (!Array.isArray(linksField)) continue;
    for (const other of linksField) {
      if (typeof other === "string") addLink(m.id, other);
    }
  }

  return { nodes, links };
}

export function MemoryGraph(props: Props) {
  const { memories, selectedId, onSelect, width, height } = props;
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(
    undefined,
  );

  const data = useMemo(
    () => buildGraph(memories, selectedId),
    [memories, selectedId],
  );

  // Filter dangling links (point to an id we don't have) — happens when the
  // user filters by category but a metadata.links entry references an
  // out-of-filter memory.
  const filtered = useMemo(() => {
    const ids = new Set(data.nodes.map((n) => n.id));
    return {
      nodes: data.nodes,
      links: data.links.filter(
        (l) => ids.has(l.source) && ids.has(l.target),
      ),
    };
  }, [data]);

  // Recenter when the dataset shape changes meaningfully.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const t = setTimeout(() => {
      try {
        fg.zoomToFit(400, 60);
      } catch {
        /* graph not ready yet */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [memories.length]);

  if (memories.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center px-12 text-center">
        <div className="max-w-md">
          <div
            aria-hidden
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-3xl text-emerald-400"
          >
            ◌
          </div>
          <h3 className="mb-2 text-lg font-semibold text-neutral-100">
            No memories yet
          </h3>
          <p className="text-sm leading-relaxed text-neutral-400">
            Your AI will start building this graph as you chat, decide, and
            store facts. Or add one yourself with{" "}
            <strong className="text-neutral-200">+ Add memory</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ForceGraph2D<GraphNode, GraphLink>
      ref={fgRef}
      width={width}
      height={height}
      graphData={filtered}
      backgroundColor="#0a0a0a"
      nodeRelSize={4}
      nodeLabel={(node) => {
        const n = node as GraphNode;
        const truncated =
          n.fact.length > 80 ? n.fact.slice(0, 80) + "…" : n.fact;
        return `<div style="max-width:280px;padding:6px 8px;background:#171717;border:1px solid #404040;border-radius:6px;color:#e5e5e5;font-size:12px;font-family:ui-sans-serif,system-ui;line-height:1.4"><div style="text-transform:uppercase;font-size:10px;letter-spacing:0.06em;color:${CATEGORY_COLORS[n.category]};margin-bottom:4px">${n.category}</div>${escapeHtml(truncated)}</div>`;
      }}
      nodeVal={(node) => (node as GraphNode).size}
      nodeColor={(node) => {
        const n = node as GraphNode;
        return CATEGORY_COLORS[n.category];
      }}
      nodeCanvasObjectMode={(node) =>
        (node as GraphNode).selected ? "after" : undefined
      }
      nodeCanvasObject={(node, ctx) => {
        const n = node as GraphNode & { x?: number; y?: number };
        if (!n.selected || n.x === undefined || n.y === undefined) return;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size + 3, 0, 2 * Math.PI, false);
        ctx.strokeStyle = "#fafafa";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }}
      linkColor={() => "rgba(115,115,115,0.35)"}
      linkWidth={1}
      onNodeClick={(node) => {
        const n = node as GraphNode;
        onSelect(n.id);
      }}
      onBackgroundClick={() => onSelect(null)}
      cooldownTicks={120}
      enableNodeDrag={true}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
