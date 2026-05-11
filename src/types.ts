// Shared types for the AIIA Console canvas.
import type { Node } from "@xyflow/react";

export type AgentNodeData = {
  label: string;
  prompt: string;
  model: string;
  tools: string[]; // free-form tool names for now
};

export type VaultReadNodeData = {
  label: string;
  path: string; // e.g. "AIIA/Daily/" or "20-Workstreams/aiia-console.md"
  query: string; // optional Dataview-ish query (placeholder)
};

export type VaultWriteNodeData = {
  label: string;
  path: string;
  section: string; // markdown heading to write under
};

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
        model: "claude-opus-4-7",
        tools: [],
      };
    case "vaultRead":
      return { label: "Vault Read", path: "", query: "" };
    case "vaultWrite":
      return { label: "Vault Write", path: "", section: "" };
  }
}

// Placeholder model options. Real model resolution happens in the streaming
// bridge story (P1).
export const MODEL_OPTIONS = [
  "claude-opus-4-7",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "ollama/llama3.1",
  "ollama/qwen2.5",
];
