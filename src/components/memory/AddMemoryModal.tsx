// Modal to add a new memory via brain_remember.

import { useEffect, useRef, useState } from "react";

import {
  CATEGORY_COLORS,
  MEMORY_CATEGORIES,
  type MemoryCategory,
} from "../../brain/client";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    fact: string;
    category: MemoryCategory;
    source?: string;
  }) => Promise<void>;
};

export function AddMemoryModal(props: Props) {
  const { open, onClose, onSubmit } = props;
  const [fact, setFact] = useState("");
  const [category, setCategory] = useState<MemoryCategory>("lessons");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setFact("");
      setCategory("lessons");
      setSource("");
      setError(null);
      // Autofocus after the modal mounts.
      const t = setTimeout(() => textareaRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = fact.trim();
    if (!trimmed) {
      setError("Fact is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        fact: trimmed,
        category,
        source: source.trim() ? source.trim() : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-[480px] max-w-[92vw] rounded-lg border border-neutral-700 bg-neutral-950 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-100">
            Add memory
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-500 hover:text-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            ✕
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-neutral-400">Fact</span>
          <textarea
            ref={textareaRef}
            value={fact}
            onChange={(e) => setFact(e.target.value)}
            rows={4}
            placeholder="What should your AI remember?"
            className="block w-full resize-y rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </label>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">
              Category
            </span>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as MemoryCategory)
              }
              className="block w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {MEMORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">
              Source (optional)
            </span>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. AIIA/Decisions/2026-05-12.md"
              className="block w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
        </div>

        <div className="mb-4 flex items-center gap-2 text-[11px] text-neutral-500">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: CATEGORY_COLORS[category] }}
          />
          Will appear in the <strong className="text-neutral-300">{category}</strong> cluster.
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !fact.trim()}
            className="rounded-md border border-emerald-700 bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
