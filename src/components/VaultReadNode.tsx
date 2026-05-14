import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { VaultReadNode as VaultReadNodeType } from "../types";

const dot = (s?: string) => {
  switch (s) {
    case "running": return "bg-status-attention";
    case "done":    return "bg-amethyst-400";
    case "error":   return "bg-status-failing";
    default:        return "bg-carbon-7";
  }
};

export function VaultReadNode({ data, selected }: NodeProps<VaultReadNodeType>) {
  return (
    <div
      className={
        "min-w-[220px] max-w-[300px] rounded-lg border bg-carbon-1 text-text-1 shadow-sm " +
        (selected
          ? "border-amethyst-400 ring-1 ring-amethyst-400/40"
          : "border-carbon-6")
      }
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-amethyst-600/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
        <span className={`inline-block h-2 w-2 rounded-full ${dot(data._status)}`} />
        Vault Read
      </div>
      <div className="px-3 py-2 text-xs">
        <div className="font-medium">{data.label || "Vault Read"}</div>
        <div className="mt-1 text-[10px] text-text-4">path</div>
        <div className="truncate text-text-3 font-mono text-[11px]">{data.path || "—"}</div>
        {data.query && (
          <>
            <div className="mt-1 text-[10px] text-text-4">query</div>
            <div className="line-clamp-2 text-text-3">{data.query}</div>
          </>
        )}
        {data._output && (
          <div className="mt-2 max-h-28 overflow-auto rounded bg-void/80 p-2 text-[11px] leading-relaxed text-text-2 whitespace-pre-wrap border border-carbon-4">
            {data._output.length > 600 ? data._output.slice(0, 600) + "\n…" : data._output}
          </div>
        )}
        {data._error && (
          <div className="mt-2 rounded bg-status-failing/15 p-2 text-[11px] text-status-failing border border-status-failing/40">
            {data._error}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-carbon-3 !bg-amethyst-400"
      />
    </div>
  );
}
