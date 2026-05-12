// Flow executor for the AIIA Console.
//
// Walks a graph of AppNodes left-to-right and executes each node. Agent nodes
// stream tokens from whichever provider is configured on the node (Ollama,
// Anthropic, OpenAI, Moonshot, DeepSeek, Google); Vault nodes call into Rust
// commands. Each node's output is piped as context to its downstream
// neighbors.
//
// Scope (v0):
//   - Linear / DAG topology, single output channel per node
//   - One streaming Agent inflight at a time (canvas runs one node at a time)
//   - Cancellation via AbortController
//
// Out of scope (v0.2+): branching, parallel execution, tool-calls, retries.

import { invoke } from "@tauri-apps/api/core";
import type { Edge } from "@xyflow/react";
import type {
  AppNode,
  AgentNodeData,
  VaultReadNodeData,
  VaultWriteNodeData,
  RunStatus,
} from "./types";
import { getProviderModelId } from "./types";
import { getProvider, parseProviderModelId } from "./providers";

export type GatewayInfo = {
  base_url: string;
  auth_mode: string;
  token: string | null;
  model_default: string | null;
};

export type NodeUpdate = {
  id: string;
  status?: RunStatus;
  output?: string;
  appendToken?: string;
  error?: string;
};

export type ExecutorOpts = {
  onUpdate: (u: NodeUpdate) => void;
  signal?: AbortSignal;
};

// ---------- topology helpers ----------

function findEntryNodes(nodes: AppNode[], edges: Edge[]): AppNode[] {
  const hasIncoming = new Set(edges.map((e) => e.target));
  return nodes.filter((n) => !hasIncoming.has(n.id));
}

function downstream(nodeId: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.source === nodeId).map((e) => e.target);
}

/**
 * Topological order. Returns a list of node ids in execution order, or throws
 * if a cycle is detected.
 */
export function topoOrder(nodes: AppNode[], edges: Edge[]): string[] {
  const incoming = new Map<string, number>();
  for (const n of nodes) incoming.set(n.id, 0);
  for (const e of edges) {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, count] of incoming) {
    if (count === 0) queue.push(id);
  }
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of downstream(id, edges)) {
      const c = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, c);
      if (c === 0) queue.push(next);
    }
  }
  if (order.length !== nodes.length) {
    throw new Error(`cycle detected — executed ${order.length} of ${nodes.length} nodes`);
  }
  return order;
}

// ---------- per-kind executors ----------

async function runVaultRead(
  node: AppNode,
  _inputs: string[],
  _gw: GatewayInfo,
  _signal: AbortSignal | undefined,
): Promise<string> {
  const data = node.data as VaultReadNodeData;
  if (!data.path) throw new Error("Vault Read: 'path' is required");
  return await invoke<string>("vault_read", { path: data.path });
}

async function runVaultWrite(
  node: AppNode,
  inputs: string[],
  _gw: GatewayInfo,
  _signal: AbortSignal | undefined,
): Promise<string> {
  const data = node.data as VaultWriteNodeData;
  if (!data.path) throw new Error("Vault Write: 'path' is required");
  const content = inputs.join("\n\n").trim();
  if (!content) throw new Error("Vault Write: no input content");
  const mode = data.mode ?? "section";
  const result = await invoke<string>("vault_write", {
    path: data.path,
    content,
    mode,
    section: data.section || null,
  });
  return `wrote → ${result}`;
}

async function runAgent(
  node: AppNode,
  inputs: string[],
  _gw: GatewayInfo,
  signal: AbortSignal | undefined,
  onToken: (tok: string) => void,
): Promise<string> {
  const data = node.data as AgentNodeData;
  const fullId = getProviderModelId(data);
  if (!fullId) {
    throw new Error(`Agent "${data.label}": no model configured`);
  }
  const { provider: providerId, model } = parseProviderModelId(fullId);
  if (!model) {
    throw new Error(`Agent "${data.label}": invalid model id "${fullId}"`);
  }
  const provider = getProvider(providerId);

  const userParts: string[] = [];
  if (data.prompt) userParts.push(data.prompt);
  if (inputs.length > 0) {
    userParts.push("---");
    userParts.push("## Input context");
    userParts.push(inputs.join("\n\n"));
  }
  const userMessage = userParts.join("\n\n");

  let collected = "";
  for await (const chunk of provider.stream({
    model,
    messages: [{ role: "user", content: userMessage }],
    signal,
  })) {
    if (chunk.delta) {
      collected += chunk.delta;
      onToken(chunk.delta);
    }
    if (chunk.done) break;
  }
  return collected;
}

// ---------- orchestrator ----------

export async function runFlow(
  nodes: AppNode[],
  edges: Edge[],
  opts: ExecutorOpts,
): Promise<{ outputs: Record<string, string>; entries: AppNode[]; order: string[] }> {
  const order = topoOrder(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outputs: Record<string, string> = {};
  const entries = findEntryNodes(nodes, edges);

  // We still resolve gateway config so vault nodes and any future
  // gateway-routed providers can use it, but errors are non-fatal: agent
  // nodes route through the provider registry directly.
  let gw: GatewayInfo;
  try {
    gw = await invoke<GatewayInfo>("gateway_config");
  } catch {
    gw = { base_url: "", auth_mode: "none", token: null, model_default: null };
  }

  for (const id of order) {
    if (opts.signal?.aborted) {
      opts.onUpdate({ id, status: "error", error: "aborted" });
      throw new Error("aborted");
    }
    const node = byId.get(id);
    if (!node) continue;

    // Gather upstream outputs
    const upstreamIds = edges.filter((e) => e.target === id).map((e) => e.source);
    const inputs = upstreamIds.map((u) => outputs[u] ?? "").filter(Boolean);

    opts.onUpdate({ id, status: "running", output: "" });
    try {
      let result: string;
      if (node.type === "vaultRead") {
        result = await runVaultRead(node, inputs, gw, opts.signal);
      } else if (node.type === "vaultWrite") {
        result = await runVaultWrite(node, inputs, gw, opts.signal);
      } else if (node.type === "agent") {
        result = await runAgent(node, inputs, gw, opts.signal, (tok) => {
          opts.onUpdate({ id, appendToken: tok });
        });
      } else {
        throw new Error(`unknown node type: ${(node as { type?: string }).type}`);
      }
      outputs[id] = result;
      opts.onUpdate({ id, status: "done", output: result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      opts.onUpdate({ id, status: "error", error: msg });
      throw e;
    }
  }

  return { outputs, entries, order };
}

// ---------- session writer ----------

export type SessionMeta = {
  flowName: string;
  startedAt: string;
  endedAt: string;
  outputs: Record<string, string>;
  nodes: AppNode[];
};

export async function writeSession(meta: SessionMeta): Promise<string> {
  const slug = meta.flowName.replace(/\.flow\.json$/, "").replace(/[^a-z0-9-]+/gi, "-");
  const date = meta.startedAt.slice(0, 10);
  const path = `40-Sessions/${date}-${slug}.md`;
  const body = renderSessionMarkdown(meta);
  return await invoke<string>("vault_write", {
    path,
    content: body,
    mode: "overwrite",
    section: null,
  });
}

function renderSessionMarkdown(meta: SessionMeta): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push("type: session");
  lines.push(`date: ${meta.startedAt.slice(0, 10)}`);
  lines.push(`flow: "${meta.flowName}"`);
  lines.push('source: "aiia-console"');
  lines.push("tags: [session, aiia-console]");
  lines.push("---");
  lines.push("");
  lines.push(`# Flow run — ${meta.flowName}`);
  lines.push("");
  lines.push(`- started: ${meta.startedAt}`);
  lines.push(`- ended:   ${meta.endedAt}`);
  lines.push("");
  lines.push("## Nodes");
  for (const n of meta.nodes) {
    const out = meta.outputs[n.id] ?? "";
    const label = (n.data as { label?: string }).label ?? n.type;
    lines.push(`### ${label} (\`${n.id}\`, \`${n.type}\`)`);
    if (n.type === "agent") {
      const a = n.data as AgentNodeData;
      lines.push(`*model:* ${getProviderModelId(a)}`);
      if (a.prompt) {
        lines.push("");
        lines.push("**Prompt:**");
        lines.push("```");
        lines.push(a.prompt);
        lines.push("```");
      }
    }
    if (out) {
      lines.push("");
      lines.push("**Output:**");
      lines.push("");
      lines.push(out);
    }
    lines.push("");
  }
  return lines.join("\n");
}
