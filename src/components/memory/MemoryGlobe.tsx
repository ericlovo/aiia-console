// The memory globe. Every memory is a point on a 3D sphere you can spin —
// drag to rotate, scroll to zoom, click a node to open it. Replaces the flat
// force graph: same data, same edges, but laid out on a fixed Fibonacci
// sphere instead of a physics hairball.
//
// Layout choices that matter:
//   * Nodes are sorted by category before placement, so each category forms
//     a contiguous swath on the sphere — spin to a region, not a needle in
//     a cloud. Positions are FIXED (fx/fy/fz): no simulation, no jitter,
//     1400 nodes render at full frame rate.
//   * Edges (shared source + metadata.links, same derivation as before) cut
//     through the globe as translucent chords.
//   * The globe drifts slowly on its own; grabbing it takes over.

import { useEffect, useMemo, useRef } from "react";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";

import {
  CATEGORY_COLORS,
  deriveCategory,
  type Memory,
  type MemoryCategory,
} from "../../brain/client";

type GlobeNode = {
  id: string;
  fact: string;
  category: MemoryCategory;
  size: number;
  selected: boolean;
  fx: number;
  fy: number;
  fz: number;
};

type GlobeLink = {
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

/** Sphere radius scaled to the population so density stays comfortable. */
function globeRadius(n: number): number {
  return Math.max(80, 40 + 6 * Math.sqrt(n));
}

function buildGlobe(memories: Memory[], selectedId: string | null): {
  nodes: GlobeNode[];
  links: GlobeLink[];
  radius: number;
} {
  // Category-sorted order → contiguous category swaths on the sphere.
  const ordered = [...memories].sort((a, b) => {
    const ca = deriveCategory(a);
    const cb = deriveCategory(b);
    return ca === cb ? a.id.localeCompare(b.id) : ca.localeCompare(cb);
  });

  const n = ordered.length;
  const radius = globeRadius(n);
  const golden = Math.PI * (3 - Math.sqrt(5)); // Fibonacci lattice step

  const nodes: GlobeNode[] = ordered.map((m, i) => {
    // Fibonacci sphere: even coverage for any n.
    const y = n === 1 ? 0 : 1 - (2 * i) / (n - 1);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    return {
      id: m.id,
      fact: m.fact,
      category: deriveCategory(m),
      size: m.id === selectedId ? 6 : 3,
      selected: m.id === selectedId,
      fx: Math.cos(theta) * r * radius,
      fy: y * radius,
      fz: Math.sin(theta) * r * radius,
    };
  });

  // Same edge derivation as the 2D graph: shared `source` strings (pairwise
  // up to 6, hub-and-spoke beyond) plus explicit metadata.links.
  const bySource = new Map<string, string[]>();
  for (const m of memories) {
    const key = (m.source ?? "").trim();
    if (!key) continue;
    const arr = bySource.get(key) ?? [];
    arr.push(m.id);
    bySource.set(key, arr);
  }
  const links: GlobeLink[] = [];
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
  for (const m of memories) {
    const meta = m.metadata;
    if (!meta) continue;
    const linksField = (meta as Record<string, unknown>).links;
    if (!Array.isArray(linksField)) continue;
    for (const other of linksField) {
      if (typeof other === "string") addLink(m.id, other);
    }
  }

  return { nodes, links, radius };
}

export function MemoryGlobe(props: Props) {
  const { memories, selectedId, onSelect, width, height } = props;
  const fgRef = useRef<ForceGraphMethods<GlobeNode, GlobeLink> | undefined>(
    undefined,
  );

  const data = useMemo(
    () => buildGlobe(memories, selectedId),
    [memories, selectedId],
  );

  const filtered = useMemo(() => {
    const ids = new Set(data.nodes.map((n) => n.id));
    return {
      nodes: data.nodes,
      links: data.links.filter((l) => ids.has(l.source) && ids.has(l.target)),
    };
  }, [data]);

  // Camera + idle drift. Distance follows the radius so the globe fills the
  // frame whether it holds 40 memories or 1400.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const controls = fg.controls() as {
      autoRotate?: boolean;
      autoRotateSpeed?: number;
    };
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
  }, []);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const t = setTimeout(() => {
      try {
        fg.cameraPosition({ x: 0, y: 0, z: data.radius * 2.6 });
      } catch {
        /* not ready yet */
      }
    }, 100);
    return () => clearTimeout(t);
  }, [data.radius]);

  if (memories.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center px-12 text-center">
        <div className="max-w-md">
          <div
            aria-hidden
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-carbon-4 bg-carbon-1 text-3xl text-amethyst-400"
          >
            ◌
          </div>
          <h3 className="mb-2 text-lg font-semibold text-text-1">
            No memories yet
          </h3>
          <p className="text-sm leading-relaxed text-text-4">
            Your AI will start building this globe as you chat, decide, and
            store facts. Or add one yourself with{" "}
            <strong className="text-text-2">+ Add memory</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ForceGraph3D<GlobeNode, GlobeLink>
      ref={fgRef}
      width={width}
      height={height}
      graphData={filtered}
      backgroundColor="#EFF4FC"
      showNavInfo={false}
      nodeRelSize={4}
      nodeVal={(node) => (node as GlobeNode).size}
      nodeColor={(node) => {
        const n = node as GlobeNode;
        return n.selected ? "#C2410C" : CATEGORY_COLORS[n.category];
      }}
      nodeOpacity={0.85}
      nodeLabel={(node) => {
        const n = node as GlobeNode;
        const truncated =
          n.fact.length > 80 ? n.fact.slice(0, 80) + "…" : n.fact;
        return `<div style="max-width:280px;padding:6px 9px;background:#FFFFFF;border:1px solid #D4E0EE;border-radius:6px;color:#26344A;font-size:12px;font-family:'EB Garamond','Georgia',serif;line-height:1.45;box-shadow:0 4px 14px rgba(22,32,46,0.12)"><div style="text-transform:uppercase;font-size:10px;letter-spacing:0.08em;color:${CATEGORY_COLORS[n.category]};margin-bottom:3px">${n.category}</div>${escapeHtml(truncated)}</div>`;
      }}
      linkColor={() => "rgba(38,52,74,0.14)"}
      linkOpacity={0.14}
      linkWidth={0.4}
      onNodeClick={(node) => {
        const n = node as GlobeNode;
        onSelect(n.id);
      }}
      onBackgroundClick={() => onSelect(null)}
      enableNodeDrag={false}
      cooldownTicks={0}
      warmupTicks={0}
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
