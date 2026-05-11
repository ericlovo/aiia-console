import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentNode as AgentNodeType } from "../types";

export function AgentNode({ data, selected }: NodeProps<AgentNodeType>) {
  return (
    <div
      className={
        "min-w-[220px] rounded-lg border bg-neutral-900 text-neutral-100 shadow-sm " +
        (selected
          ? "border-indigo-400 ring-1 ring-indigo-400/40"
          : "border-neutral-700")
      }
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-indigo-600/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
        <span className="inline-block h-2 w-2 rounded-full bg-indigo-200" />
        Agent
      </div>
      <div className="px-3 py-2 text-xs">
        <div className="font-medium text-neutral-100">{data.label || "Agent"}</div>
        <div className="mt-1 text-[10px] text-neutral-400">model</div>
        <div className="text-neutral-300">{data.model}</div>
        {data.prompt && (
          <>
            <div className="mt-1 text-[10px] text-neutral-400">prompt</div>
            <div className="line-clamp-2 text-neutral-300">{data.prompt}</div>
          </>
        )}
        {data.tools && data.tools.length > 0 && (
          <>
            <div className="mt-1 text-[10px] text-neutral-400">tools</div>
            <div className="flex flex-wrap gap-1">
              {data.tools.map((t) => (
                <span
                  key={t}
                  className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300"
                >
                  {t}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-neutral-900 !bg-indigo-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-neutral-900 !bg-indigo-400"
      />
    </div>
  );
}
