// Google Gemini provider. Uses the streamGenerateContent endpoint which
// returns NDJSON of GenerateContentResponse objects (alt=sse not used here —
// the keystore proxy can speak any HTTP body).
//
// Endpoint shape:
//   POST https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent?alt=sse
// We use alt=sse so framing matches our SSE helper.

import type {
  ChatMessage,
  ModelInfo,
  Provider,
  ProviderInfo,
  StreamChunk,
  StreamOptions,
} from "./types";
import { keystoreStream, sseEvents } from "./keystoreStream";

const MODELS: ModelInfo[] = [
  { provider: "google", id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { provider: "google", id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
];

function toGeminiContents(messages: ChatMessage[]): {
  systemInstruction?: { parts: { text: string }[] };
  contents: { role: "user" | "model"; parts: { text: string }[] }[];
} {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content);
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    }));
  return {
    systemInstruction:
      systemParts.length > 0
        ? { parts: [{ text: systemParts.join("\n\n") }] }
        : undefined,
    contents: turns,
  };
}

export class GoogleProvider implements Provider {
  info: ProviderInfo = {
    id: "google",
    label: "Google (Gemini)",
    kind: "remote",
  };

  async listModels(): Promise<ModelInfo[]> {
    return MODELS;
  }

  async *stream(opts: StreamOptions): AsyncIterable<StreamChunk> {
    const { systemInstruction, contents } = toGeminiContents(opts.messages);
    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse`;

    const chunks = keystoreStream({
      provider: "google",
      url,
      body,
      headers: { "content-type": "application/json" },
      signal: opts.signal,
    });

    for await (const data of sseEvents(chunks)) {
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
        };
        const parts = parsed.candidates?.[0]?.content?.parts ?? [];
        for (const p of parts) {
          if (typeof p.text === "string" && p.text.length > 0) {
            yield { delta: p.text, done: false, raw: parsed };
          }
        }
        if (parsed.candidates?.[0]?.finishReason) {
          yield { delta: "", done: true, raw: parsed };
          return;
        }
      } catch {
        // Skip non-JSON / keepalive lines.
      }
    }
  }
}
