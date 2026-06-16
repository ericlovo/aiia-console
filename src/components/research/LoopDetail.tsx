// LoopDetail — right pane. Orchestrates the per-loop cards + run controls.
//
// Polling cadence shortens (1.5s) while the loop is running and lengthens
// (10s) when it's idle, so the UI feels live without burning CPU.

import { useCallback, useEffect, useState } from "react";

import {
  elapsedSince,
  formatDuration,
  loopIsRunning,
  loopLaunch,
  loopStatus,
  loopStop,
  type LoopStatus,
  type RunningInfo,
} from "../../loops/client";
import { BeliefCard } from "./BeliefCard";
import { EscalationsCard } from "./EscalationsCard";
import { LogTailCard } from "./LogTailCard";
import { QueueCard } from "./QueueCard";

const POLL_RUNNING_MS = 1_500;
const POLL_IDLE_MS = 10_000;

export function LoopDetail({ name }: { name: string }) {
  const [status, setStatus] = useState<LoopStatus | null>(null);
  const [running, setRunning] = useState<RunningInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"launching" | "stopping" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([loopStatus(name), loopIsRunning(name)]);
      setStatus(s);
      setRunning(r);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [name]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = running?.running ? POLL_RUNNING_MS : POLL_IDLE_MS;
    const id = window.setInterval(refresh, interval);
    return () => window.clearInterval(id);
  }, [refresh, running?.running]);

  const onLaunch = useCallback(
    async (iterLimit?: number) => {
      setBusy("launching");
      setToast(null);
      try {
        const info = await loopLaunch(name, iterLimit);
        setToast(`launched pid ${info.pid}`);
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(null);
      }
    },
    [name, refresh],
  );

  const onStop = useCallback(async () => {
    setBusy("stopping");
    setToast(null);
    try {
      await loopStop(name);
      setToast("stop signal sent");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }, [name, refresh]);

  if (error && !status) {
    return (
      <div className="p-6 text-sm text-status-error">
        Failed to load loop: {error}
      </div>
    );
  }
  if (!status) {
    return <div className="p-6 text-sm text-text-5">loading…</div>;
  }

  const isRunning = !!running?.running;
  const isTerminated = !!status.termination_reason && !isRunning;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-carbon-4 bg-carbon-1 px-6 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-2xl text-ink-900">{status.name}</h1>
          <HeaderStatus
            running={isRunning}
            terminated={isTerminated}
            reason={status.termination_reason}
            startedAt={running?.started_at}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-text-4">
          <span>iter {status.iter_count}</span>
          <span>queue {status.queue_count}</span>
          <span>completed {status.completed_count}</span>
          <span>escalations {status.escalations_count}</span>
          {status.last_iter_ts && (
            <span>last iter {elapsedSince(status.last_iter_ts)}</span>
          )}
          {status.budget?.compute_seconds_remaining != null && (
            <span>
              budget {formatDuration(status.budget.compute_seconds_remaining)}{" "}
              left
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isRunning || busy !== null}
            onClick={() => onLaunch(1)}
            className="rounded-md border border-carbon-4 bg-vellum-50 px-3 py-1 text-xs text-ink-900 transition-colors hover:bg-carbon-2 disabled:opacity-40"
          >
            ▶ run 1 iter
          </button>
          <button
            type="button"
            disabled={isRunning || busy !== null}
            onClick={() => onLaunch()}
            className="rounded-md border border-carbon-4 bg-vellum-50 px-3 py-1 text-xs text-ink-900 transition-colors hover:bg-carbon-2 disabled:opacity-40"
          >
            ▶▶ run all
          </button>
          <button
            type="button"
            disabled={!isRunning || busy !== null}
            onClick={onStop}
            className="rounded-md border border-cinnabar-500 bg-vellum-50 px-3 py-1 text-xs text-cinnabar-500 transition-colors hover:bg-cinnabar-500 hover:text-vellum-50 disabled:opacity-40"
          >
            ■ stop
          </button>
          {toast && (
            <span className="text-xs text-text-5">— {toast}</span>
          )}
          {error && (
            <span className="text-xs text-status-error">— {error}</span>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-2">
        <QueueCard name={name} />
        <BeliefCard name={name} />
        <EscalationsCard name={name} />
        <LogTailCard name={name} isRunning={isRunning} />
      </div>
    </div>
  );
}

function HeaderStatus({
  running,
  terminated,
  reason,
  startedAt,
}: {
  running: boolean;
  terminated: boolean;
  reason: string | null;
  startedAt: string | null | undefined;
}) {
  if (running) {
    return (
      <span className="rounded-full bg-status-active px-2 py-0.5 text-[10px] uppercase tracking-wider text-vellum-50">
        running {startedAt ? `· ${elapsedSince(startedAt)}` : ""}
      </span>
    );
  }
  if (terminated) {
    return (
      <span
        className="rounded-full bg-status-attention px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-900"
        title={reason ?? undefined}
      >
        terminated · {reason ?? "unknown"}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-mint-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-900">
      idle
    </span>
  );
}
