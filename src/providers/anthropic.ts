// Anthropic provider. Uses the Messages API streaming endpoint
// (https://docs.anthropic.com/en/api/messages-streaming).
// API key is held in Rust; requests are issued via the keystore proxy.

import type {
  ModelInfo,
  Provider,
  ProviderInfo,
  StreamChunk,
  StreamOptions,
} from "./types";
import { keystoreStream, sseEvents } from "./keystoreStream";

const MODELS: ModelInfo[] = [
  { provider: "anthropic", id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { provider: "anthropic", id: "claude-sonnet-4-7", label: "Claude Sonnet 4.7" },
  { provider: "anthropic", id: "claude-haiku-4-7", label: "Claude Haiku 4.7" },
];

export class AnthropicProvider implements Provider {
  info: ProviderInfo = {
    id: "anthropic",
    label: "Anthropic",
    kind: "remote",
  };

  async listModels(): Promise<ModelInfo[]> {
    return MODELS;
  }

  async *stream(opts: StreamOptions): AsyncIterable<StreamChunk> {
    // Anthropic expects system prompt as a top-level field, not a message.
    const systemParts = opts.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content);
    const turns = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: 4096,
      stream: true,
      messages: turns,
    };
    if (systemParts.length > 0) body.system = systemParts.join("\n\n");

    const chunks = keystoreStream({
      provider: "anthropic",
      url: "https://api.anthropic.com/v1/messages",
      body,
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      signal: opts.signal,
    });

    for await (const data of sseEvents(chunks)) {
      if (data === "[DONE]") {
        yield { delta: "", done: true };
        return;
      }
      try {
        const parsed = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (
          parsed.type === "content_block_delta" &&
          parsed.delta?.type === "text_delta" &&
          typeof parsed.delta.text === "string"
        ) {
          yield { delta: parsed.delta.text, done: false, raw: parsed };
        } else if (parsed.type === "message_stop") {
          yield { delta: "", done: true, raw: parsed };
          return;
        }
      } catch {
        // Skip non-JSON keepalives.
      }
    }
  }
}
