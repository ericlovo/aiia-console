import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { VaultWriteNode as VaultWriteNodeType } from "../types";

const dot = (s?: string) => {
  switch (s) {
    case "running": return "bg-amber-500";
    case "done":    return "bg-emerald-400";
    case "error":   return "bg-rose-500";
    default:        return "bg-neutral-600";
  }
};

export function VaultWriteNode({
  data,
  selected,
}: NodeProps<VaultWriteNodeType>) {
  return (
    <div
      className={
        "min-w-[220px] max-w-[300px] rounded-lg border bg-neutral-900 text-neutral-100 shadow-sm " +
        (selected
          ? "border-amber-400 ring-1 ring-amber-400/40"
          : "border-neutral-700")
      }
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-amber-600/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
        <span className={`inline-block h-2 w-2 rounded-full ${dot(data._status)}`} />
        Vault Write
      </div>
      <div className="px-3 py-2 text-xs">
        <div className="font-medium">{data.label || "Vault Write"}</div>
        <div className="mt-1 text-[10px] text-neutral-400">path</div>
        <div className="truncate text-neutral-300 font-mono text-[11px]">{data.path || "—"}</div>
        <div className="mt-1 text-[10px] text-neutral-400">section</div>
        <div className="truncate text-neutral-300">{data.section || "—"}</div>
        <div className="mt-1 text-[10px] text-neutral-400">mode</div>
        <div className="text-neutral-300">{data.mode || "section"}</div>
        {data._output && (
          <div className="mt-2 rounded bg-neutral-950/80 p-2 text-[11px] text-neutral-300 border border-neutral-800">
            {data._output}
          </div>
        )}
        {data._error && (
          <div className="mt-2 rounded bg-rose-950/40 p-2 text-[11px] text-rose-300 border border-rose-900/50">
            {data._error}
          </div>
        )}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-neutral-900 !bg-amber-400"
      />
    </div>
  );
}
