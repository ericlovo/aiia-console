// QueueCard — what's next in the todo queue.
//
// Reads loop_status (already polled by parent via its own cadence; this card
// has its own slow poll so it works standalone too) and pulls the queue from
// state.json by reading the same status payload.
//
// Note: loop_status returns *counts* but not the queue contents. To render the
// list, we re-parse state.json directly via a hand-rolled invoke would be
// nicer, but for now we render via the parent's status counts and link to the
// CLI for full queue inspection.

import { useEffect, useState } from "react";

import { loopStatus, type LoopStatus } from "../../loops/client";

export function QueueCard({ name }: { name: string }) {
  const [status, setStatus] = useState<LoopStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    loopStatus(name).then((s) => {
      if (!cancelled) setStatus(s);
    });
    const id = window.setInterval(
      () => loopStatus(name).then((s) => !cancelled && setStatus(s)),
      4_000,
    );
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [name]);

  return (
    <Card title={`Queue · ${status?.queue_count ?? "—"}`}>
      {status ? (
        status.queue_count === 0 ? (
          <div className="text-xs text-text-5">
            Queue is empty. The next iteration will emit a{" "}
            <code className="font-mono text-[10px]">NeedsRefill</code>{" "}
            escalation. Refill via:
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[10px] text-text-4">
              python3 -m loops.cli refill {name} --cases &lt;file.json&gt;
            </pre>
          </div>
        ) : (
          <div className="space-y-1 text-xs text-text-3">
            <div>{status.queue_count} case(s) waiting.</div>
            <div className="text-[10px] text-text-5">
              (Inline queue listing comes in next pass — for now, see{" "}
              <code className="font-mono">state.json</code> at{" "}
              <code className="break-all font-mono">{status.state_dir}</code>.)
            </div>
          </div>
        )
      ) : (
        <div className="text-xs text-text-5">loading…</div>
      )}
    </Card>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-carbon-4 bg-carbon-1 p-4">
      <h3 className="mb-2 font-display text-sm tracking-wide text-ink-900">
        {title}
      </h3>
      {children}
    </section>
  );
}
