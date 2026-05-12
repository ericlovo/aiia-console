// Shared types for the AIIA Console canvas.
import type { Node } from "@xyflow/react";

// ---- Saved data (persisted in .flow.json) ----

export type AgentNodeData = {
  label: string;
  prompt: string;
  model: string;
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
  { kind: "agent", label: "Agent", color: "bg-indigo-600" },
  { kind: "vaultRead", label: "Vault Read", color: "bg-emerald-600" },
  { kind: "vaultWrite", label: "Vault Write", color: "bg-amber-600" },
];

export function defaultDataFor(kind: NodeKind): FlowNodeData {
  switch (kind) {
    case "agent":
      return {
        label: "Agent",
        prompt: "",
        model: "anthropic/claude-opus-4-7",
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

// Built-in / known model registry. Augmented at runtime with Ollama models
// discovered via gateway+ollama_models Tauri command.
export const BUILTIN_MODELS: string[] = [
  "anthropic/claude-opus-4-7",
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
];
