type Props = {
  flows: string[];
  currentFlow: string;
  onSelect: (name: string) => void;
  onRefresh: () => void;
};

export function LeftRail({ flows, currentFlow, onSelect, onRefresh }: Props) {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-carbon-4 bg-void">
      <div className="flex items-center justify-between border-b border-carbon-4 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-4">
          Flows
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="text-[10px] text-text-5 hover:text-text-2"
          title="Refresh flow list"
        >
          ↻
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {flows.length === 0 && (
          <div className="px-2 py-1 text-[11px] text-text-6">
            No saved flows yet. Build something and hit Save.
          </div>
        )}
        <ul className="flex flex-col gap-0.5">
          {flows.map((f) => {
            const display = f.replace(/\.flow\.json$/, "");
            const active = f === currentFlow;
            return (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => onSelect(f)}
                  className={
                    "w-full truncate rounded px-2 py-1 text-left text-xs " +
                    (active
                      ? "bg-carbon-3 text-text-1"
                      : "text-text-4 hover:bg-carbon-1 hover:text-text-2")
                  }
                >
                  {display}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-carbon-4 px-3 py-2 text-[10px] text-text-6">
        ~/AIIA/Flows/
      </div>
    </aside>
  );
}
