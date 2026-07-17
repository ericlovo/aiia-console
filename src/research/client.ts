// Research client — typed access to the Brain's /v1/research/* API via the
// Rust commands in src-tauri/src/research.rs. Mirrors src/brain/client.ts:
// list/get reads resolve to null when the Brain is unreachable so the tab can
// render a "Brain not detected" state; creates throw with the Brain's own
// error detail; runSession consumes the SSE stream of one research session
// as typed loop events.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { invokeBrain } from "../brain/client";

// ---------- types (mirror local_brain/research/topic.py + engine events) ----------

export interface ResearchTopic {
  id: string;
  title: string;
  question: string;
  status: "active" | "paused" | "complete";
  profile: string;
  created_at: string;
  seeds: string[];
  gaps: string[];
  synthesis: string;
  sources_indexed: string[];
  run_count: number;
  last_run: string | null;
}

export interface SynthesisDoc {
  topic_id: string;
  title: string;
  question: string;
  synthesis: string;
  gaps: string[];
  sources_indexed: string[];
  run_count: number;
  last_run: string | null;
  status: string;
}

/** One event from a running research session (the Brain's REPL loop). */
export type RunEvent =
  | {
      type: "meta";
      session_id: string;
      model: string;
      variables: unknown;
      max_iterations: number;
      token_budget: number;
    }
  | {
      type: "action";
      iteration: number;
      action: string;
      details: Record<string, unknown>;
      latency_ms: number;
      tokens: unknown;
    }
  | {
      type: "result";
      iteration: number;
      action: string;
      ok: boolean;
      preview: string;
      exec_latency_ms: number;
    }
  | { type: "fallback"; reason: string; iteration: number }
  | { type: "error"; message: string }
  | {
      type: "done";
      answer: string;
      session_id: string;
      iterations: number;
      tokens_used: number;
    };

/** The kinds of topic the Brain knows how to seed. Human labels live in the UI. */
export type TopicKind = "general" | "erdos" | "literature";

// ---------- reads ----------

export async function listTopics(): Promise<ResearchTopic[] | null> {
  const resp = await invokeBrain<ResearchTopic[] | null>("research_list_topics");
  return resp ?? null;
}

export async function getTopic(id: string): Promise<ResearchTopic | null> {
  const resp = await invokeBrain<ResearchTopic | null>("research_get_topic", { id });
  return resp ?? null;
}

export async function getSynthesis(id: string): Promise<SynthesisDoc | null> {
  const resp = await invokeBrain<SynthesisDoc | null>("research_get_synthesis", {
    id,
  });
  return resp ?? null;
}

// ---------- creates ----------

export function createGeneralTopic(
  title: string,
  question: string,
  seeds: string[],
): Promise<ResearchTopic> {
  return invokeBrain<ResearchTopic>("research_create_topic", {
    title,
    question,
    seeds,
    profile: "general",
  });
}

export function createErdosTopic(
  number: number,
  seeds: string[],
): Promise<ResearchTopic> {
  return invokeBrain<ResearchTopic>("research_create_erdos", { number, seeds });
}

export function createLiteratureTopic(
  subject: string,
  seeds: string[],
): Promise<ResearchTopic> {
  return invokeBrain<ResearchTopic>("research_create_literature", {
    subject,
    seeds,
  });
}

// ---------- the run stream ----------

type RawStreamEvent =
  | { kind: "chunk"; data: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

export interface RunHandle {
  /** Resolves when the session ends (done, error, or cancel). */
  finished: Promise<void>;
  /** Cancel the session mid-stream. */
  cancel: () => void;
}

/**
 * Run one research session on a topic, delivering each loop event to
 * `onEvent` as it arrives. SSE reassembly happens here; the Rust side just
 * relays raw chunks (same contract as keystore_call).
 */
export function runSession(
  topicId: string,
  onEvent: (ev: RunEvent) => void,
): RunHandle {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    invoke("research_run_cancel", { requestId }).catch(() => {});
  };

  const finished = (async () => {
    let buffered = "";
    let unlisten: UnlistenFn | null = null;

    const deliverBlock = (block: string) => {
      // One SSE event: join its data: lines, then JSON-parse.
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (dataLines.length === 0) return;
      const payload = dataLines.join("\n");
      if (payload === "[DONE]") return;
      try {
        onEvent(JSON.parse(payload) as RunEvent);
      } catch {
        // A malformed event shouldn't kill the whole session feed.
      }
    };

    try {
      await new Promise<void>((resolve, reject) => {
        listen<RawStreamEvent>(`research_run:${requestId}`, (ev) => {
          const p = ev.payload;
          if (p.kind === "chunk") {
            buffered += p.data;
            let sep: number;
            while ((sep = buffered.indexOf("\n\n")) !== -1) {
              deliverBlock(buffered.slice(0, sep));
              buffered = buffered.slice(sep + 2);
            }
            return;
          }
          if (p.kind === "done") resolve();
          else if (p.kind === "error") {
            if (cancelled) resolve();
            else reject(new Error(p.message));
          }
        }).then((un) => {
          unlisten = un;
          invoke<void>("research_run", { requestId, topicId }).catch((e) => {
            // Errors also arrive as stream events; this is a backstop for
            // invoke-level failures (bad args, state poisoned).
            reject(e instanceof Error ? e : new Error(String(e)));
          });
        }, reject);
      });
    } finally {
      if (unlisten) (unlisten as UnlistenFn)();
    }
  })();

  return { finished, cancel };
}

// ---------- small display helpers ----------

/** "3m ago" / "2h ago" style elapsed time for topic list rows. */
export function elapsedSince(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
