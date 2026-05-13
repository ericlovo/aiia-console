import type { DragEvent } from "react";
import { NODE_KINDS, type NodeKind } from "../types";

type Props = {
  onAdd: (kind: NodeKind) => void;
};

export function NodePalette({ onAdd }: Props) {
  function onDragStart(e: DragEvent<HTMLButtonElement>, kind: NodeKind) {
    e.dataTransfer.setData("application/aiia-node", kind);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div className="flex items-center gap-2 border-b border-carbon-4 bg-void px-3 py-2">
      <span className="mr-1 text-[10px] uppercase tracking-wider text-text-5">
        Palette
      </span>
      {NODE_KINDS.map(({ kind, label, color }) => (
        <button
          key={kind}
          type="button"
          draggable
          onDragStart={(e) => onDragStart(e, kind)}
          onClick={() => onAdd(kind)}
          className={
            "flex items-center gap-1.5 rounded-md border border-carbon-6 bg-carbon-1 px-2.5 py-1 text-xs text-text-1 hover:border-carbon-7 hover:bg-carbon-3"
          }
          title={`Drag onto canvas or click to add ${label}`}
        >
          <span className={"inline-block h-2 w-2 rounded-full " + color} />
          {label}
        </button>
      ))}
      <span className="ml-2 text-[10px] text-text-6">
        drag onto canvas or click to add
      </span>
    </div>
  );
}
