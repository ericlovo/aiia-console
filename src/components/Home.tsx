// Home — the default surface. A quiet vellum room with five agents.
// Tenet sits at the top (the host, marked with a single cinnabar dot).
// The other four arrange in a 2×2 below: Writer | Scribe on one row,
// Researcher | Libranian on the next, encoding the role taxonomy
// (outward vs. inward · generate vs. retrieve).
//
// Click an agent → caller swaps to the chat surface with that agent in
// the header. Hover → reveals the agent's current state line (idle for
// this session; real status comes when the A2A wiring lands).

import { AGENTS, type AgentId, type Agent } from "../agents";

type Props = {
  onSelectAgent: (id: AgentId) => void;
};

export function Home({ onSelectAgent }: Props) {
  const host = AGENTS.find((a) => a.isHost);
  const others = AGENTS.filter((a) => !a.isHost);

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-8 py-16">
        {host && (
          <div className="mb-20">
            <AgentCard agent={host} onSelect={onSelectAgent} />
          </div>
        )}

        <div className="grid w-full grid-cols-1 gap-y-16 gap-x-12 sm:grid-cols-2">
          {others.map((a) => (
            <div key={a.id} className="flex justify-center">
              <AgentCard agent={a} onSelect={onSelectAgent} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type CardProps = {
  agent: Agent;
  onSelect: (id: AgentId) => void;
};

function AgentCard({ agent, onSelect }: CardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(agent.id)}
      className="group flex flex-col items-center text-center focus:outline-none"
      aria-label={`Open conversation with ${agent.name}`}
    >
      <Monogram initial={agent.initial} isHost={agent.isHost} />
      <div
        className="mt-4 font-display text-3xl tracking-[0.04em] text-ink-900"
        style={{ fontWeight: 500 }}
      >
        {agent.name}
      </div>
      <div className="mt-1 font-body text-sm italic text-ink-700">
        {agent.role}
      </div>
      <div
        aria-hidden
        className="mt-2 h-3 font-body text-[11px] italic text-ink-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        idle
      </div>
    </button>
  );
}

function Monogram({ initial, isHost }: { initial: string; isHost?: boolean }) {
  return (
    <div className="relative">
      <div
        className="flex h-24 w-24 items-center justify-center rounded-full bg-vellum-100 transition-all duration-200 group-hover:bg-vellum-200 group-focus-visible:bg-vellum-200"
        style={{
          border: "1px solid rgba(20, 17, 13, 0.18)",
          boxShadow: "inset 0 0 0 1px rgba(251, 247, 236, 0.6)",
        }}
      >
        <span
          className="font-display text-4xl text-ink-900"
          style={{ fontWeight: 500, lineHeight: 1 }}
        >
          {initial}
        </span>
      </div>
      {isHost && (
        <span
          aria-label="start here"
          className="dot-breathe absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-cinnabar-500"
          style={{ boxShadow: "0 0 0 2px var(--vellum-50)" }}
        />
      )}
    </div>
  );
}
