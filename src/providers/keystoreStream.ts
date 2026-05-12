// Shared helper for remote providers: routes a streaming HTTP call through
// the Tauri `keystore_call` command, which signs the request with a stored
// API key in Rust. The Rust side emits per-chunk Tauri events keyed by a
// request_id; this helper reassembles them into an async iterable of raw
// body bytes (decoded as utf-8 lines).
//
// Each remote provider supplies its own parser on top of this.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type RawStreamEvent =
  | { kind: "chunk"; data: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

export interface KeystoreCallOpts {
  provider: string;
  url: string;
  body: unknown;
  /** Optional extra HTTP headers (Authorization is added by Rust). */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Issue a streaming call through the Rust keystore proxy. Yields decoded
 * utf-8 text chunks as they arrive. Caller is responsible for parsing
 * whatever framing the upstream provider uses (SSE, NDJSON, etc.).
 */
export async function* keystoreStream(
  opts: KeystoreCallOpts,
): AsyncIterable<string> {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Buffer events that arrive before the consumer pulls them.
  const queue: RawStreamEvent[] = [];
  let resolveNext: ((ev: RawStreamEvent) => void) | null = null;

  const push = (ev: RawStreamEvent) => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(ev);
    } else {
      queue.push(ev);
    }
  };

  const nextEvent = (): Promise<RawStreamEvent> =>
    new Promise((resolve) => {
      const buffered = queue.shift();
      if (buffered) resolve(buffered);
      else resolveNext = resolve;
    });

  const unlisten: UnlistenFn = await listen<RawStreamEvent>(
    `keystore_call:${requestId}`,
    (ev) => push(ev.payload),
  );

  const onAbort = () => {
    invoke("keystore_call_cancel", { requestId }).catch(() => {});
    push({ kind: "error", message: "aborted" });
  };
  if (opts.signal) {
    if (opts.signal.aborted) {
      unlisten();
      throw new Error("aborted");
    }
    opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  // Kick off the call. We don't await its result here — chunks come via
  // events. The promise resolves when the request completes server-side,
  // which is usually right around the `done` event.
  const callPromise = invoke<void>("keystore_call", {
    requestId,
    provider: opts.provider,
    url: opts.url,
    body: opts.body,
    headers: opts.headers ?? {},
  });

  // Surface invoke errors as a terminal event.
  callPromise.catch((e: unknown) => {
    push({ kind: "error", message: e instanceof Error ? e.message : String(e) });
  });

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const ev = await nextEvent();
      if (ev.kind === "chunk") {
        yield ev.data;
        continue;
      }
      if (ev.kind === "done") return;
      if (ev.kind === "error") throw new Error(ev.message);
    }
  } finally {
    unlisten();
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Wrap an async iterable of utf-8 chunks into a line iterator that yields
 * each \n-terminated logical line. Useful for SSE / NDJSON parsers.
 */
export async function* lines(
  chunks: AsyncIterable<string>,
): AsyncIterable<string> {
  let buffered = "";
  for await (const chunk of chunks) {
    buffered += chunk;
    let nl: number;
    while ((nl = buffered.indexOf("\n")) !== -1) {
      yield buffered.slice(0, nl);
      buffered = buffered.slice(nl + 1);
    }
  }
  if (buffered.length > 0) yield buffered;
}

/**
 * Wrap an async iterable of utf-8 chunks into an SSE event iterator. Each
 * yielded value is the joined data lines of one event (i.e. the JSON payload
 * for OpenAI-style streams), with trailing newlines stripped.
 */
export async function* sseEvents(
  chunks: AsyncIterable<string>,
): AsyncIterable<string> {
  let buffered = "";
  for await (const chunk of chunks) {
    buffered += chunk;
    let sep: number;
    while ((sep = buffered.indexOf("\n\n")) !== -1) {
      const block = buffered.slice(0, sep);
      buffered = buffered.slice(sep + 2);
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (dataLines.length > 0) yield dataLines.join("\n");
    }
  }
}
