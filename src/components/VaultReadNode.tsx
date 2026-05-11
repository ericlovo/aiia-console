import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { VaultReadNode as VaultReadNodeType } from "../types";

export function VaultReadNode({ data, selected }: NodeProps<VaultReadNodeType>) {
  return (
    <div
      className={
        "min-w-[200px] rounded-lg border bg-neutral-900 text-neutral-100 shadow-sm " +
        (selected
          ? "border-emerald-400 ring-1 ring-emerald-400/40"
          : "border-neutral-700")
      }
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-200" />
        Vault Read
      </div>
      <div className="px-3 py-2 text-xs">
        <div className="font-medium">{data.label || "Vault Read"}</div>
        <div className="mt-1 text-[10px] text-neutral-400">path</div>
        <div className="truncate text-neutral-300">{data.path || "—"}</div>
        {data.query && (
          <>
            <div className="mt-1 text-[10px] text-neutral-400">query</div>
            <div className="line-clamp-2 text-neutral-300">{data.query}</div>
          </>
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
