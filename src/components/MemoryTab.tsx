// MemoryTab — the visual centerpiece of AIIA Console.
//
// Three-pane layout:
//   1. Left  — filters, stats, search, add button
//   2. Center — force-directed graph of memories
//   3. Right — detail panel for the selected memory
//
// All Brain access is funneled through the Rust brain_* commands (see
// src-tauri/src/brain.rs). The UI handles three top-level states: Brain
// detected + memories, Brain detected + empty, Brain not detected.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  brainForget,
  brainListMemories,
  brainRemember,
  brainSearch,
  brainStatus,
  deriveCategory,
  type BrainStatus,
  type Memory,
  type MemoryCategory,
  type MemoryStats,
} from "../brain/client";
import { AddMemoryModal } from "./memory/AddMemoryModal";
import { MemoryDetail } from "./memory/MemoryDetail";
import { MemoryGraph } from "./memory/MemoryGraph";
import {
  MemorySidebar,
  type CategoryFilter,
} from "./memory/MemorySidebar";

type Toast = { kind: "error" | "info"; message: string } | null;

export function MemoryTab() {
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHitIds, setSearchHitIds] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  // Track graph container dimensions so the force graph sizes correctly.
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const [graphSize, setGraphSize] = useState<{ w: number; h: number }>({
    w: 800,
    h: 600,
  });

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setGraphSize({ w: Math.max(200, width), h: Math.max(200, height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  // Auto-dismiss toasts.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await brainListMemories();
      if (!resp) {
        setMemories([]);
        setStats(null);
      } else {
        setMemories(resp.memories);
        setStats(resp.stats);
      }
    } catch (e) {
      setToast({
        kind: "error",
        message:
          e instanceof Error
            ? `Failed to load memories: ${e.message}`
            : "Failed to load memories.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial mount: probe the Brain once. If reachable, also load memories.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await brainStatus();
        if (cancelled) return;
        setStatus(s);
        setStatusChecked(true);
        if (s) {
          await loadMemories();
        } else {
          setLoading(false);
        }
      } catch {
        if (cancelled) return;
        setStatus(null);
        setStatusChecked(true);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMemories]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Re-probe status too, in case the Brain just came online.
      const s = await brainStatus();
      setStatus(s);
      if (s) await loadMemories();
    } finally {
      setRefreshing(false);
    }
  }, [loadMemories]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query) {
      setSearchHitIds(null);
      return;
    }
    setSearching(true);
    try {
      const resp = await brainSearch(query, 50);
      if (!resp) {
        setSearchHitIds(new Set());
        setToast({
          kind: "error",
          message: "Search unavailable — Brain unreachable.",
        });
        return;
      }
      // The search endpoint returns chunks with `content` and `source` rather
      // than memory ids. Match back to memories by content == fact.
      const hits = new Set<string>();
      const factToId = new Map<string, string[]>();
      for (const m of memories) {
        const arr = factToId.get(m.fact) ?? [];
        arr.push(m.id);
        factToId.set(m.fact, arr);
      }
      for (const r of resp.results) {
        if (!r.content) continue;
        const ids = factToId.get(r.content);
        if (ids) for (const id of ids) hits.add(id);
      }
      setSearchHitIds(hits);
    } catch (e) {
      setToast({
        kind: "error",
        message:
          e instanceof Error
            ? `Search failed: ${e.message}`
            : "Search failed.",
      });
    } finally {
      setSearching(false);
    }
  }, [memories]);

  const handleAdd = useCallback(
    async (input: { fact: string; category: MemoryCategory; source?: string }) => {
      const created = await brainRemember(input);
      setToast({ kind: "info", message: `Remembered: ${created.id}` });
      await loadMemories();
    },
    [loadMemories],
  );

  const handleForget = useCallback(
    async (id: string) => {
      const ok = await brainForget(id);
      if (!ok) throw new Error("Brain refused to forget that memory.");
      setSelectedId((s) => (s === id ? null : s));
      setToast({ kind: "info", message: "Memory forgotten." });
      await loadMemories();
    },
    [loadMemories],
  );

  const handleExport = useCallback(async (m: Memory) => {
    const json = JSON.stringify(m, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${m.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Filter memories by category, then by search hits if a search is active.
  const filteredMemories = useMemo(() => {
    let out = memories;
    if (filter !== "all") {
      out = out.filter((m) => deriveCategory(m) === filter);
    }
    if (searchHitIds) {
      out = out.filter((m) => searchHitIds.has(m.id));
    }
    return out;
  }, [memories, filter, searchHitIds]);

  // Find the selected memory + its connected siblings.
  const selectedMemory = useMemo(
    () => filteredMemories.find((m) => m.id === selectedId) ?? null,
    [filteredMemories, selectedId],
  );

  const connected = useMemo(() => {
    if (!selectedMemory) return [];
    const out: Memory[] = [];
    const seen = new Set<string>();
    const sameSource = selectedMemory.source?.trim();
    for (const m of memories) {
      if (m.id === selectedMemory.id) continue;
      if (sameSource && m.source?.trim() === sameSource) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          out.push(m);
        }
      }
    }
    const linksField = (selectedMemory.metadata as Record<string, unknown> | undefined)
      ?.links;
    if (Array.isArray(linksField)) {
      for (const other of linksField) {
        if (typeof other !== "string") continue;
        const m = memories.find((mm) => mm.id === other);
        if (m && !seen.has(m.id)) {
          seen.add(m.id);
          out.push(m);
        }
      }
    }
    return out;
  }, [selectedMemory, memories]);

  const total = stats?.total_memories ?? memories.length;

  // Brain not detected — render fallback panel.
  if (statusChecked && !status) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-md text-center">
          <div
            aria-hidden
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-amber-700/40 bg-amber-950/30 text-2xl text-amber-400"
          >
            ⚠
          </div>
          <h2 className="mb-2 text-lg font-semibold text-neutral-100">
            AIIA Brain not detected
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-neutral-400">
            Memory features require the Brain running on{" "}
            <code className="rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-xs text-neutral-300">
              localhost:8100
            </code>
            .
          </p>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-xs text-neutral-200 hover:border-neutral-500 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {refreshing ? "Checking…" : "Check again"}
            </button>
            <a
              href="https://github.com/ericlovo/AIIA"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-400 underline decoration-emerald-700 hover:text-emerald-300"
            >
              See setup instructions →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <MemorySidebar
        total={total}
        stats={stats}
        activeFilter={filter}
        onFilterChange={(f) => {
          setFilter(f);
          setSelectedId(null);
        }}
        onSearch={handleSearch}
        searchQuery={searchQuery}
        searching={searching}
        onAdd={() => setAddOpen(true)}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <main
        ref={graphContainerRef}
        className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-neutral-950"
      >
        {loading ? (
          <GraphSkeleton />
        ) : (
          <MemoryGraph
            memories={filteredMemories}
            selectedId={selectedId}
            onSelect={setSelectedId}
            width={graphSize.w}
            height={graphSize.h}
          />
        )}

        {!loading && filteredMemories.length === 0 && memories.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-6 mx-auto w-fit rounded-md border border-neutral-800 bg-neutral-950/90 px-3 py-1.5 text-xs text-neutral-400">
            No memories match the current filter.
          </div>
        )}

        {toast && (
          <div
            className={
              "pointer-events-none absolute inset-x-0 bottom-6 mx-auto w-fit max-w-[80%] rounded-md border px-3 py-1.5 text-xs " +
              (toast.kind === "error"
                ? "border-red-900/60 bg-red-950/80 text-red-200"
                : "border-emerald-800/60 bg-emerald-950/80 text-emerald-200")
            }
            role="status"
          >
            {toast.message}
          </div>
        )}
      </main>

      <MemoryDetail
        memory={selectedMemory}
        connected={connected}
        onSelect={setSelectedId}
        onForget={handleForget}
        onExport={handleExport}
      />

      <AddMemoryModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAdd}
      />
    </div>
  );
}

function GraphSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-neutral-700"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <p className="text-xs text-neutral-500">Loading memories…</p>
      </div>
    </div>
  );
}
