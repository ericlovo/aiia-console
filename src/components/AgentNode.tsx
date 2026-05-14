import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentNode as AgentNodeType } from "../types";
import { getProviderModelId } from "../types";

const statusColor = (s?: string) => {
  switch (s) {
    case "running": return "bg-status-attention";
    case "done":    return "bg-amethyst-500";
    case "error":   return "bg-status-failing";
    default:        return "bg-carbon-7";
  }
};

export function AgentNode({ data, selected }: NodeProps<AgentNodeType>) {
  return (
    <div
      className={
        "min-w-[260px] max-w-[320px] rounded-lg border bg-carbon-1 text-text-1 shadow-sm " +
        (selected
          ? "border-status-agents ring-1 ring-status-agents/40"
          : "border-carbon-6")
      }
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-status-agents/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
        <span className={`inline-block h-2 w-2 rounded-full ${statusColor(data._status)}`} />
        Agent
        {data._status === "running" && (
          <span className="ml-auto text-[10px] font-normal text-status-agents/80">streaming…</span>
        )}
      </div>
      <div className="px-3 py-2 text-xs">
        <div className="font-medium text-text-1">{data.label || "Agent"}</div>
        <div className="mt-1 text-[10px] text-text-4">model</div>
        <div className="text-text-3 font-mono text-[11px]">{getProviderModelId(data) || "—"}</div>
        {data.prompt && (
          <>
            <div className="mt-1 text-[10px] text-text-4">prompt</div>
            <div className="line-clamp-2 text-text-3">{data.prompt}</div>
          </>
        )}
        {data.tools && data.tools.length > 0 && (
          <>
            <div className="mt-1 text-[10px] text-text-4">tools</div>
            <div className="flex flex-wrap gap-1">
              {data.tools.map((t) => (
                <span
                  key={t}
                  className="rounded bg-carbon-3 px-1.5 py-0.5 text-[10px] text-text-3"
                >
                  {t}
                </span>
              ))}
            </div>
          </>
        )}
        {data._output && (
          <div className="mt-2 max-h-32 overflow-auto rounded bg-void/80 p-2 text-[11px] leading-relaxed text-text-2 whitespace-pre-wrap border border-carbon-4">
            {data._output}
          </div>
        )}
        {data._error && (
          <div className="mt-2 rounded bg-status-failing/15 p-2 text-[11px] text-status-failing border border-status-failing/40">
            {data._error}
          </div>
        )}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-carbon-3 !bg-status-agents"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-carbon-3 !bg-status-agents"
      />
    </div>
  );
}
