// Ollama provider — talks to the local ollama daemon directly. listModels()
// proxies through the existing Tauri `ollama_models` command so we share the
// same reachability/error semantics as the rest of the app.

import { invoke } from "@tauri-apps/api/core";
import type {
  ChatMessage,
  ModelInfo,
  Provider,
  ProviderInfo,
  StreamChunk,
  StreamOptions,
} from "./types";

const OLLAMA_URL = "http://127.0.0.1:11434";

export class OllamaProvider implements Provider {
  info: ProviderInfo = {
    id: "ollama",
    label: "Ollama (local)",
    kind: "local",
  };

  async listModels(): Promise<ModelInfo[]> {
    try {
      const names = await invoke<string[]>("ollama_models");
      return names.map((id) => ({
        provider: "ollama",
        id,
        label: id,
      }));
    } catch {
      return [];
    }
  }

  async *stream(opts: StreamOptions): AsyncIterable<StreamChunk> {
    const body = JSON.stringify({
      model: opts.model,
      messages: opts.messages.map((m: ChatMessage) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    });

    const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: opts.signal,
    });
    if (!resp.ok || !resp.body) {
      const text = await resp.text().catch(() => "");
      throw new Error(`ollama HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    // Ollama streams newline-delimited JSON objects.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffered.indexOf("\n")) !== -1) {
        const line = buffered.slice(0, nl).trim();
        buffered = buffered.slice(nl + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
          };
          const delta = parsed.message?.content ?? "";
          const isDone = Boolean(parsed.done);
          if (delta) yield { delta, done: false, raw: parsed };
          if (isDone) {
            yield { delta: "", done: true, raw: parsed };
            return;
          }
        } catch {
          // Non-JSON keepalive — skip.
        }
      }
    }
  }
}
