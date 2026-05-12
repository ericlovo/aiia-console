// Provider registry. Holds one instance of each enabled provider and exposes
// helpers for listing/looking-up models and parsing the canonical
// `provider:model` id used on agent nodes.

import type { ModelInfo, Provider, ProviderId, ProviderInfo } from "./types";
import { OllamaProvider } from "./ollama";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { MoonshotProvider } from "./moonshot";
import { DeepSeekProvider } from "./deepseek";
import { GoogleProvider } from "./google";

const REGISTRY: Record<ProviderId, Provider | null> = {
  ollama: new OllamaProvider(),
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
  moonshot: new MoonshotProvider(),
  deepseek: new DeepSeekProvider(),
  google: new GoogleProvider(),
  // MLX is intentionally not wired up yet.
  mlx: null,
};

export function getProvider(id: ProviderId | string): Provider {
  const p = REGISTRY[id as ProviderId];
  if (!p) throw new Error(`unknown or disabled provider: ${id}`);
  return p;
}

export function listProviders(): ProviderInfo[] {
  return Object.values(REGISTRY)
    .filter((p): p is Provider => p !== null)
    .map((p) => p.info);
}

/**
 * Query every registered provider for its models. Errors from individual
 * providers (e.g. Ollama unreachable) are swallowed so the picker can still
 * render the rest.
 */
export async function listAllModels(): Promise<ModelInfo[]> {
  const providers = Object.values(REGISTRY).filter(
    (p): p is Provider => p !== null,
  );
  const settled = await Promise.allSettled(providers.map((p) => p.listModels()));
  const out: ModelInfo[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") out.push(...s.value);
  }
  return out;
}

// ---- provider:model id helpers ----

export interface ProviderModelId {
  provider: ProviderId;
  model: string;
}

/**
 * Split on the FIRST colon only — Ollama tags themselves contain colons
 * (e.g. "qwen3:14b").
 */
export function parseProviderModelId(s: string): ProviderModelId {
  const idx = s.indexOf(":");
  if (idx === -1) {
    // Legacy plain-string model — treat as Ollama by convention.
    return { provider: "ollama", model: s };
  }
  const provider = s.slice(0, idx) as ProviderId;
  const model = s.slice(idx + 1);
  return { provider, model };
}

export function formatProviderModelId(p: ProviderModelId): string {
  return `${p.provider}:${p.model}`;
}

/**
 * Convenience: normalize whatever is stored on a node (old plain-string or
 * new `provider:model`) into the canonical `provider:model` form. Returns
 * `null` for empty input.
 */
export function normalizeProviderModelId(raw: string | undefined): string | null {
  if (!raw) return null;
  const { provider, model } = parseProviderModelId(raw);
  return formatProviderModelId({ provider, model });
}
