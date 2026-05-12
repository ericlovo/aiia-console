// Provider abstraction for the AIIA Console.
//
// A Provider is anything that can list models and stream a chat completion.
// Local providers (e.g. Ollama) talk directly to a local HTTP endpoint.
// Remote providers (Anthropic, OpenAI, Moonshot, DeepSeek, Google) route
// through the Tauri keystore streaming proxy so the JS layer never sees the
// plaintext API key.

export type ProviderId =
  | "ollama"
  | "anthropic"
  | "openai"
  | "moonshot"
  | "deepseek"
  | "google"
  | "mlx";

export interface ProviderInfo {
  id: ProviderId;
  label: string;          // e.g. "Ollama (local)", "Anthropic"
  kind: "local" | "remote";
}

export interface ModelInfo {
  provider: ProviderId;   // matches ProviderInfo.id
  id: string;             // model id within provider, e.g. "qwen3:14b"
  label: string;          // human label for pickers
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  raw?: unknown;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamOptions {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

export interface Provider {
  info: ProviderInfo;
  listModels(): Promise<ModelInfo[]>;
  stream(opts: StreamOptions): AsyncIterable<StreamChunk>;
}
