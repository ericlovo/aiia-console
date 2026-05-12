// Right pane: detail view for the selected memory. Shows the fact verbatim
// (the MemPalace ethic — your AI should let you read what it remembers), plus
// metadata + actions.

import { useMemo, useState } from "react";

import {
  CATEGORY_COLORS,
  deriveCategory,
  type Memory,
} from "../../brain/client";

type Props = {
  memory: Memory | null;
  connected: Memory[];
  onSelect: (id: string) => void;
  onForget: (id: string) => Promise<void>;
  onExport: (memory: Memory) => Promise<void>;
};

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function looksLikePath(s: string): boolean {
  return /[\/\\]/.test(s) || /\.(md|txt|json|yaml|yml|toml)$/i.test(s);
}

export function MemoryDetail(props: Props) {
  const { memory, connected, onSelect, onForget, onExport } = props;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const category = useMemo(
    () => (memory ? deriveCategory(memory) : null),
    [memory],
  );

  if (!memory || !category) {
    return (
      <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-neutral-800 bg-neutral-950">
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p className="text-sm leading-relaxed text-neutral-500">
            Pick a node to see what your AI remembers.
          </p>
        </div>
      </aside>
    );
  }

  const meta = memory.metadata ?? {};
  const metaIsEmpty = Object.keys(meta).length === 0;
  const color = CATEGORY_COLORS[category];

  const handleForget = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onForget(memory.id);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      await onExport(memory);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-neutral-800 bg-neutral-950">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{ color }}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {category}
          </span>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-neutral-100 whitespace-pre-wrap break-words">
          {memory.fact}
        </p>

        <dl className="mb-4 space-y-2 text-xs">
          {memory.source && (
            <div>
              <dt className="text-neutral-500">Source</dt>
              <dd
                className={
                  "mt-0.5 break-all text-neutral-300 " +
                  (looksLikePath(memory.source) ? "font-mono" : "")
                }
              >
                {memory.source}
              </dd>
            </div>
          )}
          {memory.created_at && (
            <div>
              <dt className="text-neutral-500">Created</dt>
              <dd
                className="mt-0.5 text-neutral-300"
                title={memory.created_at}
              >
                {relativeTime(memory.created_at)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-neutral-500">ID</dt>
            <dd className="mt-0.5 break-all font-mono text-[11px] text-neutral-400">
              {memory.id}
            </dd>
          </div>
        </dl>

        {!metaIsEmpty && (
          <details className="mb-4 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2">
            <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-200">
              Metadata
            </summary>
            <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed text-neutral-300">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </details>
        )}

        {connected.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Connected ({connected.length})
            </h4>
            <ul className="space-y-1">
              {connected.slice(0, 8).map((c) => {
                const cat = deriveCategory(c);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      className="group flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs text-neutral-400 hover:border-neutral-800 hover:bg-neutral-900 hover:text-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <span
                        aria-hidden
                        className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                      />
                      <span className="line-clamp-2">{c.fact}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {error && (
        <div className="border-t border-red-900/40 bg-red-950/40 px-5 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-neutral-800 bg-neutral-950 px-5 py-3">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          disabled={busy}
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 hover:text-neutral-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleForget}
          disabled={busy}
          className={
            "flex-1 rounded-md border px-2 py-1.5 text-xs disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 " +
            (confirming
              ? "border-red-700 bg-red-950 text-red-200 hover:bg-red-900"
              : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-red-700 hover:text-red-200")
          }
          title={confirming ? "Click again to confirm" : "Forget this memory"}
        >
          {confirming ? "Confirm forget?" : "Forget"}
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={busy}
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 hover:text-neutral-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          Export
        </button>
      </div>

      {editOpen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[300px] rounded-lg border border-neutral-700 bg-neutral-950 p-5 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold text-neutral-100">
              Edit not yet wired
            </h3>
            <p className="mb-4 text-xs leading-relaxed text-neutral-400">
              The Brain doesn&apos;t yet expose a memory-update endpoint. For
              now, forget the memory and add a corrected version.
            </p>
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
