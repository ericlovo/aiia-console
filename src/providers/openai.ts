// OpenAI provider. Uses the chat/completions streaming endpoint (SSE).

import type {
  ModelInfo,
  Provider,
  ProviderInfo,
  StreamChunk,
  StreamOptions,
} from "./types";
import { keystoreStream, sseEvents } from "./keystoreStream";

const MODELS: ModelInfo[] = [
  { provider: "openai", id: "gpt-5", label: "GPT-5" },
  { provider: "openai", id: "gpt-5-mini", label: "GPT-5 mini" },
  { provider: "openai", id: "gpt-4.1", label: "GPT-4.1" },
];

export class OpenAIProvider implements Provider {
  info: ProviderInfo = {
    id: "openai",
    label: "OpenAI",
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
      provider: "openai",
      url: "https://api.openai.com/v1/chat/completions",
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
