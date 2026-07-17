// TopicList — left sidebar: one row per research topic.
//
// Each row surfaces the loop's vitals at a glance: status, how many sessions
// have run, and how many gaps are open — gaps being the number a returning
// user actually cares about (they're what the next run will chase).

import { elapsedSince, type ResearchTopic } from "../../research/client";

export function TopicList({
  topics,
  selected,
  onSelect,
}: {
  topics: ResearchTopic[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex flex-1 flex-col overflow-y-auto">
      {topics.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onSelect(t.id)}
            className={
              "flex w-full flex-col items-start gap-1 border-b border-carbon-3 px-4 py-3 text-left transition-colors hover:bg-carbon-2 " +
              (selected === t.id ? "bg-carbon-2" : "")
            }
          >
            <span className="font-display text-sm tracking-wide text-ink-900">
              {t.title}
            </span>
            <span className="flex items-center gap-2 text-[11px] text-text-5">
              <StatusPill status={t.status} />
              <span>
                {t.run_count} {t.run_count === 1 ? "run" : "runs"}
              </span>
              <span>· {t.gaps.length} open {t.gaps.length === 1 ? "gap" : "gaps"}</span>
            </span>
            {t.last_run && (
              <span className="text-[10px] text-text-6">
                last run: {elapsedSince(t.last_run)}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-status-active text-vellum-50"
      : status === "complete"
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
