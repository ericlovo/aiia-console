import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { VaultWriteNode as VaultWriteNodeType } from "../types";

export function VaultWriteNode({
  data,
  selected,
}: NodeProps<VaultWriteNodeType>) {
  return (
    <div
      className={
        "min-w-[200px] rounded-lg border bg-neutral-900 text-neutral-100 shadow-sm " +
        (selected
          ? "border-amber-400 ring-1 ring-amber-400/40"
          : "border-neutral-700")
      }
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-amber-600/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-200" />
        Vault Write
      </div>
      <div className="px-3 py-2 text-xs">
        <div className="font-medium">{data.label || "Vault Write"}</div>
        <div className="mt-1 text-[10px] text-neutral-400">path</div>
        <div className="truncate text-neutral-300">{data.path || "—"}</div>
        <div className="mt-1 text-[10px] text-neutral-400">section</div>
        <div className="truncate text-neutral-300">{data.section || "—"}</div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-neutral-900 !bg-amber-400"
      />
    </div>
  );
}
