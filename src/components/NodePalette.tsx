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
    <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3 py-2">
      <span className="mr-1 text-[10px] uppercase tracking-wider text-neutral-500">
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
            "flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-100 hover:border-neutral-500 hover:bg-neutral-800"
          }
          title={`Drag onto canvas or click to add ${label}`}
        >
          <span className={"inline-block h-2 w-2 rounded-full " + color} />
          {label}
        </button>
      ))}
      <span className="ml-2 text-[10px] text-neutral-600">
        drag onto canvas or click to add
      </span>
    </div>
  );
}
