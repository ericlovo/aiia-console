import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { VaultWriteNode as VaultWriteNodeType } from "../types";

const dot = (s?: string) => {
  switch (s) {
    case "running": return "bg-status-attention";
    case "done":    return "bg-amethyst-400";
    case "error":   return "bg-status-failing";
    default:        return "bg-carbon-7";
  }
};

export function VaultWriteNode({
  data,
  selected,
}: NodeProps<VaultWriteNodeType>) {
  return (
    <div
      className={
        "min-w-[220px] max-w-[300px] rounded-lg border bg-carbon-1 text-text-1 shadow-sm " +
        (selected
          ? "border-status-attention ring-1 ring-status-attention/40"
          : "border-carbon-6")
      }
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-status-attention/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
        <span className={`inline-block h-2 w-2 rounded-full ${dot(data._status)}`} />
        Vault Write
      </div>
      <div className="px-3 py-2 text-xs">
        <div className="font-medium">{data.label || "Vault Write"}</div>
        <div className="mt-1 text-[10px] text-text-4">path</div>
        <div className="truncate text-text-3 font-mono text-[11px]">{data.path || "—"}</div>
        <div className="mt-1 text-[10px] text-text-4">section</div>
        <div className="truncate text-text-3">{data.section || "—"}</div>
        <div className="mt-1 text-[10px] text-text-4">mode</div>
        <div className="text-text-3">{data.mode || "section"}</div>
        {data._output && (
          <div className="mt-2 rounded bg-void/80 p-2 text-[11px] text-text-3 border border-carbon-4">
            {data._output}
          </div>
        )}
        {data._error && (
          <div className="mt-2 rounded bg-status-failing/40 p-2 text-[11px] text-status-failing border border-status-failing/50">
            {data._error}
          </div>
        )}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-carbon-3 !bg-status-attention"
      />
    </div>
  );
}
