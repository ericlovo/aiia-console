import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { VaultReadNode as VaultReadNodeType } from "../types";

const dot = (s?: string) => {
  switch (s) {
    case "running": return "bg-amber-500";
    case "done":    return "bg-emerald-400";
    case "error":   return "bg-rose-500";
    default:        return "bg-neutral-600";
  }
};

export function VaultReadNode({ data, selected }: NodeProps<VaultReadNodeType>) {
  return (
    <div
      className={
        "min-w-[220px] max-w-[300px] rounded-lg border bg-neutral-900 text-neutral-100 shadow-sm " +
        (selected
          ? "border-emerald-400 ring-1 ring-emerald-400/40"
          : "border-neutral-700")
      }
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
        <span className={`inline-block h-2 w-2 rounded-full ${dot(data._status)}`} />
        Vault Read
      </div>
      <div className="px-3 py-2 text-xs">
        <div className="font-medium">{data.label || "Vault Read"}</div>
        <div className="mt-1 text-[10px] text-neutral-400">path</div>
        <div className="truncate text-neutral-300 font-mono text-[11px]">{data.path || "—"}</div>
        {data.query && (
          <>
            <div className="mt-1 text-[10px] text-neutral-400">query</div>
            <div className="line-clamp-2 text-neutral-300">{data.query}</div>
          </>
        )}
        {data._output && (
          <div className="mt-2 max-h-28 overflow-auto rounded bg-neutral-950/80 p-2 text-[11px] leading-relaxed text-neutral-200 whitespace-pre-wrap border border-neutral-800">
            {data._output.length > 600 ? data._output.slice(0, 600) + "\n…" : data._output}
          </div>
        )}
        {data._error && (
          <div className="mt-2 rounded bg-rose-950/40 p-2 text-[11px] text-rose-300 border border-rose-900/50">
            {data._error}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-neutral-900 !bg-emerald-400"
      />
    </div>
  );
}
