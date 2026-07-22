// LoopsTab — the engine gauge.
//
// Shows the M4's scheduled ops loops (ADR-008: standup, commit-telemetry, ...)
// from the Brain's /v1/loops registry: what each loop is, when it last ran,
// whether it succeeded, and what it produced. Click the output path to open
// the artifact (usually a vault note). Read-only by design — loops are
// created and scheduled on the Brain side; this surface proves they're alive.

import { useCallback, useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";

import { brainOpsLoops, BrainAuthError, type OpsLoop } from "../brain/client";

const REFRESH_MS = 60_000;

type LoadState = "loading" | "ready" | "unreachable" | "auth";

function relativeTime(iso?: string): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function shortPath(p?: string): string {
  if (!p) return "";
  return p.replace(/^\/Users\/[^/]+\//, "~/");
}

export function LoopsTab() {
  const [loops, setLoops] = useState<OpsLoop[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  const refresh = useCallback(async () => {
    try {
      const result = await brainOpsLoops();
      if (result === null) {
        setState("unreachable");
        return;
      }
      setLoops(result);
      setState("ready");
    } catch (e) {
      setState(e instanceof BrainAuthError ? "auth" : "unreachable");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  return (
    <div className="flex flex-1 justify-center overflow-y-auto px-6 py-8">
      <div className="w-full max-w-2xl">
        <h1 className="font-display text-xl text-ink-900">Agents</h1>
        <p className="mt-1 text-sm text-ink-600">
          Each agent is a local model running one looped task on this machine —
          on a schedule, for free. Here's what they are and what they do.
        </p>

        {state === "loading" && (
          <p className="mt-8 text-sm text-ink-600">Reaching the Brain…</p>
        )}
        {state === "unreachable" && (
          <p className="mt-8 text-sm text-ink-600">
            Brain not reachable at its configured URL — loops can't be read.
          </p>
        )}
        {state === "auth" && (
          <p className="mt-8 text-sm text-cinnabar-500">
            Brain rejected the API key. Set it in Settings → Brain API key.
          </p>
        )}
        {state === "ready" && loops.length === 0 && (
          <p className="mt-8 text-sm text-ink-600">
            No loops registered yet. Loops appear here after their first run.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {loops.map((loop) => (
            <LoopCard key={loop.name} loop={loop} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LoopCard({ loop }: { loop: OpsLoop }) {
  const ok = loop.last_status === "ok";
  const neverRun = !loop.last_run;
  return (
    <div className="rounded-xl border border-carbon-4 bg-vellum-50 px-5 py-4">
      {/* Identity: name + what kind of agent */}
      <div className="flex items-center gap-2.5">
        <span
          aria-label={
            neverRun ? "never run" : ok ? "last run ok" : `last run ${loop.last_status}`
          }
          className={
            "h-2 w-2 shrink-0 rounded-full " +
            (neverRun ? "bg-ink-500" : ok ? "bg-mint-600" : "bg-cinnabar-500")
          }
        />
        <span className="font-medium text-ink-900">{loop.name}</span>
        {loop.kind && (
          <span className="rounded-full bg-vellum-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-ink-600">
            {loop.kind}
          </span>
        )}
        <span className="ml-auto text-xs text-ink-600">
          {neverRun ? "never run" : relativeTime(loop.last_run)}
          {typeof loop.runs === "number" && loop.runs > 0 && ` · ${loop.runs} runs`}
        </span>
      </div>

      {/* What it does — the plain-language answer to "what is this?" */}
      {loop.does && (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-700">{loop.does}</p>
      )}

      {/* Parameters: the agent's actual config, stated */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-600">
        {loop.model && (
          <span>
            <span className="text-ink-500">model</span>{" "}
            <span className="text-ink-800">{loop.model}</span>
          </span>
        )}
        {(loop.trigger || loop.schedule) && (
          <span>
            <span className="text-ink-500">trigger</span>{" "}
            <span className="text-ink-800">{loop.trigger ?? loop.schedule}</span>
          </span>
        )}
        {loop.execution && (
          <span>
            <span className="text-ink-500">acts</span>{" "}
            <span className="text-ink-800">
              {loop.execution === "propose" ? "proposes only" : loop.execution}
            </span>
          </span>
        )}
      </div>

      {/* Last run outcome + its artifact */}
      {(loop.last_note || loop.last_output) && (
        <div className="mt-2.5 border-t border-carbon-3 pt-2">
          {loop.last_note && (
            <p className="text-xs text-ink-600">Last run: {loop.last_note}</p>
          )}
          {loop.last_output && (
            <button
              type="button"
              onClick={() => void openPath(loop.last_output!)}
              title="Open what this agent last produced"
              className="mt-1 block max-w-full truncate text-left text-xs text-ink-600 underline decoration-carbon-4 underline-offset-2 hover:text-ink-900"
            >
              {shortPath(loop.last_output)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
