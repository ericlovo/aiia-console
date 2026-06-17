// Left pane: header + search + category filters + add button.

import { useEffect, useState } from "react";

import {
  CATEGORY_COLORS,
  MEMORY_CATEGORIES,
  type MemoryCategory,
  type MemoryStats,
} from "../../brain/client";

export type CategoryFilter = MemoryCategory | "all";

type Props = {
  total: number;
  stats: MemoryStats | null;
  activeFilter: CategoryFilter;
  onFilterChange: (f: CategoryFilter) => void;
  onSearch: (query: string) => void;
  searchQuery: string;
  searching: boolean;
  onAdd: () => void;
  onRefresh: () => void;
  refreshing: boolean;
};

export function MemorySidebar(props: Props) {
  const {
    total,
    stats,
    activeFilter,
    onFilterChange,
    onSearch,
    searchQuery,
    searching,
    onAdd,
    onRefresh,
    refreshing,
  } = props;

  const [searchInput, setSearchInput] = useState(searchQuery);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput("");
    onSearch("");
  };

  const byCategory = stats?.by_category ?? {};

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-carbon-4 bg-void">
      <div className="border-b border-carbon-4 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-text-1">
              Memory
            </h2>
            <p className="mt-0.5 text-[11px] text-text-5">
              {total} fact{total === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh"
            aria-label="Refresh memories"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-carbon-6 bg-carbon-1 text-sm text-text-3 hover:border-carbon-7 hover:text-text-1 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amethyst-500"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className={"h-3.5 w-3.5 " + (refreshing ? "animate-spin" : "")}
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>
      </div>

      <form onSubmit={handleSearchSubmit} className="border-b border-carbon-4 px-5 py-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search memories…"
            aria-label="Search memories"
            className="block w-full rounded-md border border-carbon-6 bg-carbon-1 px-3 py-1.5 pr-8 text-xs text-text-1 placeholder:text-text-6 focus:border-amethyst-500 focus:outline-none focus:ring-1 focus:ring-amethyst-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-5 hover:text-text-2"
            >
              ✕
            </button>
          )}
        </div>
        {searching && (
          <p className="mt-1 text-[10px] text-text-5">Searching…</p>
        )}
        {searchQuery && !searching && (
          <p className="mt-1 text-[10px] text-text-5">
            Showing results for &ldquo;{searchQuery}&rdquo;
          </p>
        )}
      </form>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <h3 className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wider text-text-5">
          Categories
        </h3>
        <ul className="space-y-0.5">
          <li>
            <CategoryRow
              label="All"
              count={total}
              color="#26344A"
              active={activeFilter === "all"}
              onClick={() => onFilterChange("all")}
            />
          </li>
          {MEMORY_CATEGORIES.map((c) => (
            <li key={c}>
              <CategoryRow
                label={c}
                count={byCategory[c] ?? 0}
                color={CATEGORY_COLORS[c]}
                active={activeFilter === c}
                onClick={() => onFilterChange(c)}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-carbon-4 p-3">
        <button
          type="button"
          onClick={onAdd}
          className="block w-full rounded-md border border-amethyst-700/60 bg-amethyst-600/20 px-3 py-2 text-xs font-medium text-amethyst-300 hover:bg-amethyst-600/30 hover:text-amethyst-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amethyst-500"
        >
          + Add memory
        </button>
      </div>
    </aside>
  );
}

function CategoryRow(props: {
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  const { label, count, color, active, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amethyst-500 " +
        (active
          ? "bg-carbon-1 text-text-1"
          : "text-text-4 hover:bg-carbon-1/60 hover:text-text-2")
      }
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 capitalize">{label}</span>
      <span className="text-[10px] text-text-5">{count}</span>
    </button>
  );
}
