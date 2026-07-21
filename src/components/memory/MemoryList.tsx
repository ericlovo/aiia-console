// MemoryList — the workbench view of the memory store (ADR-009).
//
// A dense, scannable table: every memory as a row with category, fact,
// source, and age. Instant substring filter (complements the sidebar's
// semantic search), newest-first with month group headers, row selection
// feeding the existing detail pane, and bulk forget for pruning.
// This is the primary view; the globe is the toggle-away visualization.

import { useMemo, useState } from "react";

import {
  CATEGORY_COLORS,
  deriveCategory,
  type Memory,
} from "../../brain/client";

// Parse a usable timestamp: created_at if present, else the epoch suffix in
// ids like "lessons_0_1778617142". Returns ms, or 0 when unknowable.
export function memoryTime(m: Memory): number {
  if (m.created_at) {
    const t = new Date(m.created_at).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const tail = m.id.split("_").pop();
  if (tail && /^\d{9,11}$/.test(tail)) return Number(tail) * 1000;
  return 0;
}

function ageLabel(ms: number): string {
  if (!ms) return "—";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function monthLabel(ms: number): string {
  if (!ms) return "Undated";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// Absolute timestamp — the thing "search by date" needs to actually see.
function exactTime(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const RECENCY: { id: string; label: string; ms: number }[] = [
  { id: "all", label: "All", ms: Infinity },
  { id: "1d", label: "24h", ms: 86_400_000 },
  { id: "7d", label: "7 days", ms: 7 * 86_400_000 },
  { id: "30d", label: "30 days", ms: 30 * 86_400_000 },
];

const PAGE = 200;

export function MemoryList({
  memories,
  selectedId,
  onSelect,
  onForgetMany,
}: {
  memories: Memory[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onForgetMany: (ids: string[]) => Promise<void>;
}) {
  const [quickFilter, setQuickFilter] = useState("");
  const [recency, setRecency] = useState("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [pruning, setPruning] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const rows = useMemo(() => {
    const q = quickFilter.trim().toLowerCase();
    const window = RECENCY.find((r) => r.id === recency)?.ms ?? Infinity;
    const cutoff = window === Infinity ? 0 : Date.now() - window;
    const filtered = memories.filter((m) => {
      if (cutoff && memoryTime(m) < cutoff) return false;
      if (!q) return true;
      return (
        m.fact.toLowerCase().includes(q) ||
        (m.source ?? "").toLowerCase().includes(q)
      );
    });
    return [...filtered].sort((a, b) => memoryTime(b) - memoryTime(a));
  }, [memories, quickFilter, recency]);

  const visible = rows.slice(0, limit);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirming(false);
  };

  const handleBulkForget = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setPruning(true);
    try {
      await onForgetMany([...checked]);
      setChecked(new Set());
    } finally {
      setPruning(false);
      setConfirming(false);
    }
  };

  let lastMonth = "";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Workbench header: quick filter + bulk actions */}
      <div className="flex items-center gap-3 border-b border-carbon-4 px-4 py-2">
        <input
          type="text"
          value={quickFilter}
          onChange={(e) => {
            setQuickFilter(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Filter facts and sources…"
          aria-label="Filter memories"
          className="w-72 rounded-md border border-carbon-4 bg-carbon-1 px-2.5 py-1 text-xs text-text-2 placeholder:text-text-5 focus:border-carbon-7 focus:outline-none"
        />
        <span className="text-xs text-text-5">
          {rows.length === memories.length
            ? `${rows.length} memories`
            : `${rows.length} of ${memories.length}`}
        </span>
        <div className="flex items-center gap-1">
          {RECENCY.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setRecency(r.id);
                setLimit(PAGE);
              }}
              aria-pressed={recency === r.id}
              title={r.id === "all" ? "All memories" : `Last ${r.label}`}
              className={
                "rounded-md px-2 py-0.5 text-xs focus:outline-none " +
                (recency === r.id
                  ? "bg-carbon-2 text-text-1"
                  : "text-text-5 hover:text-text-2")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {checked.size > 0 && (
          <button
            type="button"
            onClick={handleBulkForget}
            disabled={pruning}
            className={
              "rounded-md border px-3 py-1 text-xs disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amethyst-500 " +
              (confirming
                ? "border-status-failing bg-status-failing/15 text-status-failing"
                : "border-carbon-6 bg-carbon-1 text-text-2 hover:border-carbon-7")
            }
          >
            {pruning
              ? "Forgetting…"
              : confirming
                ? `Really forget ${checked.size}?`
                : `Forget ${checked.size} selected`}
          </button>
        )}
      </div>

      {/* The table */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-text-5">
            No memories match.
          </p>
        )}
        {visible.map((m) => {
          const t = memoryTime(m);
          const month = monthLabel(t);
          const header =
            month !== lastMonth ? (
              <div
                key={`h-${month}`}
                className="sticky top-0 z-10 border-b border-carbon-4 bg-void/95 px-4 py-1 text-[11px] font-medium uppercase tracking-wider text-text-5"
              >
                {month}
              </div>
            ) : null;
          lastMonth = month;
          const cat = deriveCategory(m);
          const isSelected = m.id === selectedId;
          return (
            <div key={m.id}>
              {header}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(isSelected ? null : m.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(isSelected ? null : m.id);
                  }
                }}
                className={
                  "flex cursor-pointer items-start gap-3 border-b border-carbon-2 px-4 py-2 text-left transition-colors " +
                  (isSelected ? "bg-carbon-2" : "hover:bg-carbon-1")
                }
              >
                <input
                  type="checkbox"
                  checked={checked.has(m.id)}
                  onChange={() => toggle(m.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select memory ${m.id}`}
                  className="mt-1 accent-amethyst-500"
                />
                <span
                  aria-hidden
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                  title={cat}
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] leading-snug text-text-2">
                    {m.fact}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-text-5">
                    {cat}
                    {m.source ? ` · ${m.source}` : ""}
                  </p>
                </div>
                <span
                  className="mt-0.5 shrink-0 text-right text-[11px] tabular-nums text-text-5"
                  title={t ? new Date(t).toLocaleString() : "no timestamp"}
                >
                  <span className="block text-text-4">{exactTime(t) || "—"}</span>
                  {ageLabel(t)}
                </span>
              </div>
            </div>
          );
        })}
        {rows.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="block w-full px-4 py-3 text-center text-xs text-text-4 hover:bg-carbon-1 focus:outline-none"
          >
            Show {Math.min(PAGE, rows.length - limit)} more of{" "}
            {rows.length - limit} remaining
          </button>
        )}
      </div>
    </div>
  );
}
