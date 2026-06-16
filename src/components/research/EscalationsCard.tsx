// EscalationsCard — recent escalations emitted by the loop.
// Click an entry to reveal its preview.

import { useEffect, useState } from "react";

import {
  loopEscalations,
  type EscalationView,
} from "../../loops/client";

export function EscalationsCard({ name }: { name: string }) {
  const [events, setEvents] = useState<EscalationView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = () => {
      loopEscalations(name)
        .then((e) => !cancelled && setEvents(e))
        .catch((e) => !cancelled && setError(String(e)));
    };
    fetch();
    const id = window.setInterval(fetch, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [name]);

  return (
    <section className="rounded-md border border-carbon-4 bg-carbon-1 p-4">
      <h3 className="mb-2 font-display text-sm tracking-wide text-ink-900">
        Escalations · {events.length}
      </h3>
      {error && <div className="text-xs text-status-error">{error}</div>}
      {events.length === 0 ? (
        <div className="text-xs text-text-5">No escalations.</div>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {events.map((ev) => (
            <li key={ev.file}>
              <button
                type="button"
                onClick={() =>
                  setOpenFile(openFile === ev.file ? null : ev.file)
                }
                className="flex w-full items-start gap-2 rounded px-2 py-1 text-left hover:bg-carbon-2"
              >
                <SeverityDot severity={ev.severity} />
                <span className="flex-1 text-xs text-text-2">{ev.type_}</span>
                <span className="text-[10px] text-text-5">
                  {ev.emitted_at}
                </span>
              </button>
              {openFile === ev.file && (
                <pre className="mt-1 whitespace-pre-wrap rounded bg-vellum-50 p-2 font-mono text-[10px] text-text-3">
                  {ev.body_preview}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === "critical"
      ? "bg-cinnabar-500"
      : severity === "warning"
      ? "bg-status-attention"
      : "bg-mint-300";
  return (
    <span
      className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
      aria-label={severity}
      title={severity}
    />
  );
}
