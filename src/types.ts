// Shared types for the AIIA Console canvas.
import type { Node } from "@xyflow/react";

// ---- Saved data (persisted in .flow.json) ----

export type AgentNodeData = {
  label: string;
  prompt: string;
  /**
   * Canonical model id in the form `<provider>:<model>`, e.g.
   * `ollama:qwen3:14b` or `anthropic:claude-opus-4-7`. Ollama model tags
   * contain colons themselves, so consumers must split on the FIRST colon.
   */
  providerModelId: string;
  /**
   * Legacy field. Older saved flows stored a plain string in `model`; on
   * load it is migrated lazily into `providerModelId` (treated as
   * `ollama:<model>`) but kept around so the .flow.json on disk is not
   * rewritten until the user saves again.
   */
  model?: string;
  tools: string[];
  // Streaming-bridge runtime fields. Optional so older flows still load.
  _output?: string;
  _status?: RunStatus;
  _error?: string;
};

export type VaultReadNodeData = {
  label: string;
  path: string;
  query: string;
  _output?: string;
  _status?: RunStatus;
  _error?: string;
};

export type VaultWriteNodeData = {
  label: string;
  path: string;
  section: string;
  mode?: "overwrite" | "append" | "section";
  _output?: string;
  _status?: RunStatus;
  _error?: string;
};

export type RunStatus = "idle" | "running" | "done" | "error";

export type FlowNodeData =
  | AgentNodeData
  | VaultReadNodeData
  | VaultWriteNodeData;

export type AgentNode = Node<AgentNodeData, "agent">;
export type VaultReadNode = Node<VaultReadNodeData, "vaultRead">;
export type VaultWriteNode = Node<VaultWriteNodeData, "vaultWrite">;

export type AppNode = AgentNode | VaultReadNode | VaultWriteNode;

export type NodeKind = "agent" | "vaultRead" | "vaultWrite";

export const NODE_KINDS: { kind: NodeKind; label: string; color: string }[] = [
  { kind: "agent", label: "Agent", color: "bg-status-agents" },
  { kind: "vaultRead", label: "Vault Read", color: "bg-amethyst-600" },
  { kind: "vaultWrite", label: "Vault Write", color: "bg-status-attention" },
];

export function defaultDataFor(kind: NodeKind): FlowNodeData {
  switch (kind) {
    case "agent":
      return {
        label: "Agent",
        prompt: "",
        providerModelId: "anthropic:claude-opus-4-7",
        tools: [],
      };
    case "vaultRead":
      return { label: "Vault Read", path: "", query: "" };
    case "vaultWrite":
      return { label: "Vault Write", path: "", section: "", mode: "section" };
  }
}

// Strip runtime-only fields before persistence so .flow.json stays clean.
export function stripRuntime<T extends FlowNodeData>(d: T): T {
  const { _output, _status, _error, ...rest } = d as T & {
    _output?: unknown;
    _status?: unknown;
    _error?: unknown;
  };
  void _output; void _status; void _error;
  return rest as T;
}

/**
 * Fallback model list used when the provider registry is unreachable
 * (e.g. listAllModels() fails mid-init). Entries are canonical
 * `provider:model` ids.
 */
export const BUILTIN_MODELS: { providerModelId: string; label: string }[] = [
  { providerModelId: "anthropic:claude-opus-4-7", label: "Anthropic / Claude Opus 4.7" },
  { providerModelId: "anthropic:claude-sonnet-4-7", label: "Anthropic / Claude Sonnet 4.7" },
  { providerModelId: "anthropic:claude-haiku-4-7", label: "Anthropic / Claude Haiku 4.7" },
  { providerModelId: "google:gemini-2.5-pro", label: "Google / Gemini 2.5 Pro" },
  { providerModelId: "google:gemini-2.5-flash", label: "Google / Gemini 2.5 Flash" },
];

/**
 * Read the canonical provider:model id off an agent node, migrating from
 * the legacy plain-string `model` field on the fly (treated as ollama).
 * Returns an empty string only when both fields are missing.
 */
export function getProviderModelId(
  d: { providerModelId?: string; model?: string },
): string {
  if (d.providerModelId) return d.providerModelId;
  if (d.model) {
    // Legacy: treat as ollama unless it already looks namespaced.
    if (d.model.includes(":") && !d.model.startsWith("ollama:")) {
      return d.model;
    }
    return d.model.startsWith("ollama:") ? d.model : `ollama:${d.model}`;
  }
  return "";
}
