// TypeScript wrapper around the Tauri brain_* commands.
//
// The Brain's actual response shape is loose JSON; we bind to the fields the
// UI uses and treat the rest as passthrough metadata. Shapes were verified
// against a live Brain at http://127.0.0.1:8100 on 2026-05-12.

import { invoke } from "@tauri-apps/api/core";

export const MEMORY_CATEGORIES = [
  "decisions",
  "patterns",
  "lessons",
  "team",
  "project",
  "agents",
  "sessions",
  "wip",
  "meta",
  "journal",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

// Per-category hue for the memory graph. Values are passed to react-force-graph
// as raw CSS color strings (the graph runs on canvas, so CSS custom properties
// can't be used directly).
//
// Palette: "manuscript pigments" — muted, mid-dark colours drawn from the
// vellum/ink brand world so the nodes read as ink-and-pigment on a cream
// surface rather than neon-on-black. They stay distinct enough to separate
// clusters at a glance and remain legible as small dots in the sidebar/detail.
// `decisions` gets brand cinnabar (#C13B2A) since decisions are identity-
// defining; `meta` is ink-500 (the warm neutral) as the quietest cluster.
export const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  decisions: "#C13B2A",  // cinnabar-500 (brand accent)
  patterns:  "#2E5A8C",  // lapis blue
  lessons:   "#2E7867",  // verdigris (mint-600)
  team:      "#B7791F",  // ochre / gold
  project:   "#155E75",  // deep teal
  agents:    "#9D4E8C",  // murex purple
  sessions:  "#5B4B8A",  // indigo
  wip:       "#C2410C",  // burnt sienna
  meta:      "#6E7C92",  // slate neutral (quietest cluster)
  journal:   "#B14A78",  // rose — personal reflections
};

export type Memory = {
  id: string;
  fact: string;
  category?: string;
  source?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
};

export type MemoryStats = {
  total_memories: number;
  by_category: Record<string, number>;
  data_dir?: string;
};

export type MemoryListResponse = {
  memories: Memory[];
  count: number;
  stats: MemoryStats;
};

export type BrainStatus = {
  identity?: string;
  name?: string;
  team?: string;
  model?: string;
  deep_model?: string;
  knowledge?: Record<string, unknown>;
  memory?: MemoryStats;
};

export type SearchResultItem = {
  content?: string;
  source?: string;
  doc_type?: string;
  relevance?: number;
  metadata?: Record<string, unknown>;
};

export type SearchResponse = {
  results: SearchResultItem[];
  count: number;
};

// Type guards / coercion. The Brain returns untyped JSON; this is the seam
// where we declare "we trust the field" with reasonable defaults instead of
// scattering `as any` across the components.
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}

function coerceMemory(raw: unknown): Memory | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = asString(r.id);
  const fact = asString(r.fact);
  if (!id || !fact) return null;
  return {
    id,
    fact,
    category: asString(r.category),
    source: asString(r.source),
    created_at: asString(r.created_at),
    metadata: asRecord(r.metadata),
  };
}

function coerceStats(raw: unknown): MemoryStats {
  const r = asRecord(raw) ?? {};
  const byCat = asRecord(r.by_category) ?? {};
  const cleanByCat: Record<string, number> = {};
  for (const [k, v] of Object.entries(byCat)) {
    const n = asNumber(v);
    if (typeof n === "number") cleanByCat[k] = n;
  }
  return {
    total_memories: asNumber(r.total_memories) ?? 0,
    by_category: cleanByCat,
    data_dir: asString(r.data_dir),
  };
}

export async function brainStatus(): Promise<BrainStatus | null> {
  const raw = await invoke<unknown>("brain_status");
  if (!raw) return null;
  const r = asRecord(raw);
  if (!r) return null;
  return {
    identity: asString(r.identity),
    name: asString(r.name),
    team: asString(r.team),
    model: asString(r.model),
    deep_model: asString(r.deep_model),
    knowledge: asRecord(r.knowledge),
    memory: r.memory ? coerceStats(r.memory) : undefined,
  };
}

export async function brainListMemories(
  category?: string,
  limit?: number,
): Promise<MemoryListResponse | null> {
  const raw = await invoke<unknown>("brain_list_memories", {
    category: category ?? null,
    limit: limit ?? null,
  });
  if (!raw) return null;
  const r = asRecord(raw);
  if (!r) return null;
  const arr = Array.isArray(r.memories) ? r.memories : [];
  const memories: Memory[] = [];
  for (const item of arr) {
    const m = coerceMemory(item);
    if (m) memories.push(m);
  }
  return {
    memories,
    count: asNumber(r.count) ?? memories.length,
    stats: coerceStats(r.stats),
  };
}

export async function brainRemember(input: {
  fact: string;
  category?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}): Promise<Memory> {
  const raw = await invoke<unknown>("brain_remember", {
    fact: input.fact,
    category: input.category ?? null,
    source: input.source ?? null,
    metadata: input.metadata ?? null,
  });
  const m = coerceMemory(raw);
  if (!m) throw new Error("Brain returned an invalid memory shape");
  return m;
}

export async function brainForget(id: string): Promise<boolean> {
  return await invoke<boolean>("brain_forget", { id });
}

export async function brainSearch(
  query: string,
  nResults?: number,
): Promise<SearchResponse | null> {
  const raw = await invoke<unknown>("brain_search", {
    query,
    nResults: nResults ?? null,
    includeSessions: false,
  });
  if (!raw) return null;
  const r = asRecord(raw);
  if (!r) return null;
  const arr = Array.isArray(r.results) ? r.results : [];
  const results: SearchResultItem[] = arr.map((item) => {
    const rec = asRecord(item) ?? {};
    return {
      content: asString(rec.content),
      source: asString(rec.source),
      doc_type: asString(rec.doc_type),
      relevance: asNumber(rec.relevance),
      metadata: asRecord(rec.metadata),
    };
  });
  return { results, count: asNumber(r.count) ?? results.length };
}

// Derive the category for a memory. The Brain includes `category` when
// listing without a filter, but omits it when the request itself filtered by
// category. We can also recover it from the id prefix (`<category>_<seq>_<ts>`).
export function deriveCategory(m: Memory, fallback?: string): MemoryCategory {
  const known = MEMORY_CATEGORIES as readonly string[];
  if (m.category && known.includes(m.category)) {
    return m.category as MemoryCategory;
  }
  if (fallback && known.includes(fallback)) return fallback as MemoryCategory;
  // Try to parse from the id: e.g. "lessons_0_1778617142".
  const prefix = m.id.split("_")[0];
  if (prefix && known.includes(prefix)) return prefix as MemoryCategory;
  return "meta";
}
