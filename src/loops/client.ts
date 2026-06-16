// TypeScript wrapper around the Tauri loop_* commands.
//
// Mirrors src/brain/client.ts: thin types, invoke() pass-through, no runtime
// validation. Shapes match the serde structs in src-tauri/src/loops.rs.

import { invoke } from "@tauri-apps/api/core";

export type LoopStatusKind = "idle" | "running" | "terminated";

export type LoopInstance = {
  name: string;
  status: LoopStatusKind | string;
  last_iter_ts: string | null;
  iter_count: number;
  queue_count: number;
};

export type BudgetView = {
  compute_seconds_remaining: number | null;
  wallclock_seconds_remaining: number | null;
  dollars_remaining: number | null;
  started_at: string | null;
};

export type LoopStatus = {
  name: string;
  adapter: string;
  iter_count: number;
  queue_count: number;
  completed_count: number;
  last_iter_ts: string | null;
  termination_reason: string | null;
  budget: BudgetView | null;
  escalations_count: number;
  state_dir: string;
  belief_path: string;
};

export type BeliefView = {
  // The Rust side returns frontmatter as { yaml_text: string } until we
  // wire serde_yaml; React renders the raw YAML as a code block. The body
  // is the Markdown after the closing fence.
  frontmatter: { yaml_text?: string } | null;
  body: string;
  path: string;
  exists: boolean;
};

export type EscalationView = {
  file: string;
  emitted_at: string;
  type_: string;
  severity: "info" | "warning" | "critical" | string;
  body_preview: string;
};

export type LaunchInfo = {
  pid: number;
  log_path: string;
  started_at: string;
};

export type RunningInfo = {
  running: boolean;
  pid: number | null;
  started_at: string | null;
};

// ---------- invoke wrappers ----------

export async function loopListInstances(): Promise<LoopInstance[]> {
  return invoke("loop_list_instances");
}

export async function loopStatus(name: string): Promise<LoopStatus> {
  return invoke("loop_status", { name });
}

export async function loopBelief(name: string): Promise<BeliefView> {
  return invoke("loop_belief", { name });
}

export async function loopEscalations(
  name: string,
  since?: string,
): Promise<EscalationView[]> {
  return invoke("loop_escalations", { name, since: since ?? null });
}

export async function loopLaunch(
  name: string,
  iterLimit?: number,
): Promise<LaunchInfo> {
  return invoke("loop_launch", { name, iterLimit: iterLimit ?? null });
}

export async function loopIsRunning(name: string): Promise<RunningInfo> {
  return invoke("loop_is_running", { name });
}

export async function loopStop(name: string): Promise<void> {
  return invoke("loop_stop", { name });
}

export async function loopTailLog(name: string, lines = 30): Promise<string> {
  return invoke("loop_tail_log", { name, lines });
}

// ---------- adapter discovery + loop creation ----------

export type ParamType = "int" | "float" | "string" | "bool";

export type ParamSpec = {
  key: string;
  label: string;
  type: ParamType;
  default?: unknown;
  min?: number;
  max?: number;
  placeholder?: string;
  help?: string;
};

export type AdapterInfo = {
  id: string;
  label: string;
  description: string;
  case_params: ParamSpec[];
};

export type CreateCase = {
  case_id: string;
  params: Record<string, unknown>;
  note?: string;
  rationale?: string;
};

export type CreateBudget = {
  compute_seconds?: number | null;
  wallclock_seconds?: number | null;
  dollars?: number | null;
};

export type CreateResult = {
  name: string;
  state_dir: string;
  belief_path: string;
  cases_added: number;
};

export async function loopAdaptersAvailable(): Promise<AdapterInfo[]> {
  return invoke("loop_adapters_available");
}

export async function loopCreate(args: {
  name: string;
  adapter: string;
  cases: CreateCase[];
  budget?: CreateBudget;
}): Promise<CreateResult> {
  return invoke("loop_create", args);
}

// ---------- generator ----------

export type GeneratorArgs = {
  adapter_id: string;
  source_text: string;
  n: number;
  model: string;
  system_prompt?: string;
  ollama_url?: string;
};

export type GeneratedCase = {
  case_id: string;
  params: Record<string, unknown>;
  note?: string;
  rationale?: string;
};

export type GenerateResult = {
  cases: GeneratedCase[];
  raw_response: string;
  model: string;
  elapsed_s: number;
};

export async function loopGenerateCases(args: GeneratorArgs): Promise<GenerateResult> {
  return invoke("loop_generate_cases", { args });
}

// ---------- helpers ----------

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(0)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export function elapsedSince(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, (Date.now() - t) / 1000);
  return formatDuration(s) + " ago";
}

export function statusTone(status: string): "healthy" | "active" | "attention" | "muted" {
  switch (status) {
    case "running":
      return "active";
    case "terminated":
      return "attention";
    case "idle":
      return "healthy";
    default:
      return "muted";
  }
}
