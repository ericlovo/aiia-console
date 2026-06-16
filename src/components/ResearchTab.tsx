// ResearchTab — autonomous research-execution loop dispatcher.
//
// Left pane: list of loop instances under ~/.aiia/loops/, each with a status
// pill. Right pane: when a loop is selected, the loop detail view with queue,
// belief, escalations, log tail, and run/stop controls.
//
// All Tauri access funnels through src/loops/client.ts. Polling is plain
// useEffect + setInterval; the cadence shortens while a loop is running so
// the user sees progress without lag, and lengthens when the loop is idle.

import { useCallback, useEffect, useState } from "react";

import {
  loopListInstances,
  type LoopInstance,
} from "../loops/client";
import { LoopDetail } from "./research/LoopDetail";
import { LoopList } from "./research/LoopList";
import { NewLoopModal } from "./research/NewLoopModal";

const INSTANCE_POLL_MS = 5_000;

export function ResearchTab() {
  const [instances, setInstances] = useState<LoopInstance[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await loopListInstances();
      setInstances(next);
      setError(null);
      // auto-select first instance on initial load
      setSelected((cur) => cur ?? next[0]?.name ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, INSTANCE_POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const onCreated = useCallback(
    (name: string) => {
      setSelected(name);
      refresh();
    },
    [refresh],
  );

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col border-r border-carbon-4 bg-carbon-1">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="font-display text-base tracking-wide text-ink-900">
            Research
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="rounded border border-carbon-4 px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-3 hover:border-cinnabar-400 hover:text-cinnabar-400"
              title="New loop"
              aria-label="New loop"
            >
              + new
            </button>
            <button
              type="button"
              onClick={refresh}
              className="text-xs text-text-5 hover:text-ink-900"
              title="Refresh"
              aria-label="Refresh"
            >
              ↻
            </button>
          </div>
        </div>
        {loading ? (
          <div className="px-4 py-2 text-xs text-text-5">loading…</div>
        ) : error ? (
          <div className="px-4 py-2 text-xs text-status-error">{error}</div>
        ) : instances.length === 0 ? (
          <div className="space-y-3 px-4 py-3 text-xs text-text-5">
            <p>No loops yet.</p>
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="w-full rounded border border-carbon-4 px-3 py-1.5 text-[11px] text-text-2 hover:border-cinnabar-400 hover:text-cinnabar-400"
            >
              + initialize a new loop
            </button>
            <p className="text-[10px] leading-relaxed text-text-6">
              You can also use the CLI:{" "}
              <code className="font-mono">python3 -m loops.cli init …</code>
            </p>
          </div>
        ) : (
          <LoopList
            instances={instances}
            selected={selected}
            onSelect={setSelected}
          />
        )}
      </aside>

      <main className="flex min-h-0 flex-1 flex-col bg-void">
        {selected ? (
          <LoopDetail name={selected} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-text-5">
            Select a loop on the left.
          </div>
        )}
      </main>

      <NewLoopModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={onCreated}
      />
    </div>
  );
}
