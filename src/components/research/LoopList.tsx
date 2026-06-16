// LoopList — left sidebar item list.

import { elapsedSince, statusTone, type LoopInstance } from "../../loops/client";

export function LoopList({
  instances,
  selected,
  onSelect,
}: {
  instances: LoopInstance[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <ul className="flex flex-1 flex-col overflow-y-auto">
      {instances.map((inst) => (
        <li key={inst.name}>
          <button
            type="button"
            onClick={() => onSelect(inst.name)}
            className={
              "flex w-full flex-col items-start gap-1 border-b border-carbon-3 px-4 py-3 text-left transition-colors hover:bg-carbon-2 " +
              (selected === inst.name ? "bg-carbon-2" : "")
            }
          >
            <span className="font-display text-sm tracking-wide text-ink-900">
              {inst.name}
            </span>
            <span className="flex items-center gap-2 text-[11px] text-text-5">
              <StatusPill status={inst.status} />
              <span>iter {inst.iter_count}</span>
              <span>· queue {inst.queue_count}</span>
            </span>
            {inst.last_iter_ts && (
              <span className="text-[10px] text-text-6">
                last: {elapsedSince(inst.last_iter_ts)}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  const cls =
    tone === "active"
      ? "bg-status-active text-vellum-50"
      : tone === "attention"
      ? "bg-status-attention text-ink-900"
      : tone === "healthy"
      ? "bg-mint-100 text-ink-900"
      : "bg-carbon-3 text-text-3";
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}
