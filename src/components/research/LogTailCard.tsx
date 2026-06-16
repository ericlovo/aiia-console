// LogTailCard — the last N lines of the loop's combined stdout/stderr log.
// Polls fast while the loop is running, slow while idle.

import { useEffect, useState } from "react";

import { loopTailLog } from "../../loops/client";

export function LogTailCard({
  name,
  isRunning,
}: {
  name: string;
  isRunning: boolean;
}) {
  const [text, setText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = () => {
      loopTailLog(name, 30)
        .then((t) => !cancelled && setText(t))
        .catch((e) => !cancelled && setError(String(e)));
    };
    fetch();
    const interval = isRunning ? 1_500 : 15_000;
    const id = window.setInterval(fetch, interval);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [name, isRunning]);

  return (
    <section className="rounded-md border border-carbon-4 bg-carbon-1 p-4 xl:col-span-2">
      <h3 className="mb-2 font-display text-sm tracking-wide text-ink-900">
        Log tail · last 30 lines
      </h3>
      {error && <div className="text-xs text-status-error">{error}</div>}
      {text ? (
        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded bg-vellum-50 p-2 font-mono text-[10px] leading-snug text-text-3">
          {text}
        </pre>
      ) : (
        <div className="text-xs text-text-5">
          {isRunning ? "no output yet…" : "log file is empty"}
        </div>
      )}
    </section>
  );
}
