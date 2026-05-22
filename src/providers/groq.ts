// Groq provider. OpenAI-compatible chat-completions API at api.groq.com.
// Models served: Llama 3.x family (free tier, very fast inference on LPUs).
// Whisper transcription lives in src/journal/whisper.ts — not surfaced here
// since transcription isn't a chat operation.

import type {
  ModelInfo,
  Provider,
  ProviderInfo,
  StreamChunk,
  StreamOptions,
} from "./types";
import { keystoreStream, sseEvents } from "./keystoreStream";

const MODELS: ModelInfo[] = [
  { provider: "groq", id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
  { provider: "groq", id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (instant)" },
  { provider: "groq", id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B" },
];

export class GroqProvider implements Provider {
  info: ProviderInfo = {
    id: "groq",
    label: "Groq (Llama, Whisper)",
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
      provider: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
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
        // Skip keepalives / malformed lines.
      }
    }
  }
}
