import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentNode as AgentNodeType } from "../types";

const statusColor = (s?: string) => {
  switch (s) {
    case "running": return "bg-amber-500";
    case "done":    return "bg-emerald-500";
    case "error":   return "bg-rose-500";
    default:        return "bg-neutral-600";
  }
};

export function AgentNode({ data, selected }: NodeProps<AgentNodeType>) {
  return (
    <div
      className={
        "min-w-[260px] max-w-[320px] rounded-lg border bg-neutral-900 text-neutral-100 shadow-sm " +
        (selected
          ? "border-indigo-400 ring-1 ring-indigo-400/40"
          : "border-neutral-700")
      }
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-indigo-600/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
        <span className={`inline-block h-2 w-2 rounded-full ${statusColor(data._status)}`} />
        Agent
        {data._status === "running" && (
          <span className="ml-auto text-[10px] font-normal text-indigo-100/80">streaming…</span>
        )}
      </div>
      <div className="px-3 py-2 text-xs">
        <div className="font-medium text-neutral-100">{data.label || "Agent"}</div>
        <div className="mt-1 text-[10px] text-neutral-400">model</div>
        <div className="text-neutral-300 font-mono text-[11px]">{data.model}</div>
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
        {data._output && (
          <div className="mt-2 max-h-32 overflow-auto rounded bg-neutral-950/80 p-2 text-[11px] leading-relaxed text-neutral-200 whitespace-pre-wrap border border-neutral-800">
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
