// DeepSeek provider. OpenAI-compatible chat completions endpoint.

import type {
  ModelInfo,
  Provider,
  ProviderInfo,
  StreamChunk,
  StreamOptions,
} from "./types";
import { keystoreStream, sseEvents } from "./keystoreStream";

const MODELS: ModelInfo[] = [
  { provider: "deepseek", id: "deepseek-chat", label: "DeepSeek Chat" },
  { provider: "deepseek", id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
];

export class DeepSeekProvider implements Provider {
  info: ProviderInfo = {
    id: "deepseek",
    label: "DeepSeek",
    kind: "remote",
  };

  async listModels(): Promise<ModelInfo[]> {
    return MODELS;
  }

  async *stream(opts: StreamOptions): AsyncIterable<StreamChunk> {
    const body = {
      model: opts.model,
      stream: true,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    };

    const chunks = keystoreStream({
      provider: "deepseek",
      url: "https://api.deepseek.com/v1/chat/completions",
      body,
      headers: { "content-type": "application/json" },
      signal: opts.signal,
    });

    for await (const data of sseEvents(chunks)) {
      if (data === "[DONE]") {
        yield { delta: "", done: true };
        return;
      }
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content ?? "";
        if (delta) yield { delta, done: false, raw: parsed };
        if (parsed.choices?.[0]?.finish_reason) {
          yield { delta: "", done: true, raw: parsed };
          return;
        }
      } catch {
        // Skip keepalives.
      }
    }
  }
}
