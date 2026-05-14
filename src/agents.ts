// AIIA's starting cast — five named agents that anchor the consumer
// surface. Each one is a character with a role, not a node in a graph.
// The host (Tenet) is where a first-time user begins.

export type AgentId = "tenet" | "writer" | "scribe" | "researcher" | "librarian";

export type Agent = {
  id: AgentId;
  /** Single capital letter for the soft circular monogram. */
  initial: string;
  /** Display name (Cormorant Garamond). */
  name: string;
  /** One-line role description (EB Garamond italic). */
  role: string;
  /** True for the agent that greets a new user. Only one. */
  isHost?: boolean;
};

export const AGENTS: Agent[] = [
  {
    id: "tenet",
    initial: "T",
    name: "Tenet",
    role: "your host",
    isHost: true,
  },
  {
    id: "writer",
    initial: "W",
    name: "Writer",
    role: "drafts for the outside world",
  },
  {
    id: "scribe",
    initial: "S",
    name: "Scribe",
    role: "captures what you say and do",
  },
  {
    id: "researcher",
    initial: "R",
    name: "Researcher",
    role: "finds and reads new material",
  },
  {
    id: "librarian",
    initial: "L",
    name: "Librarian",
    role: "tends what you already have",
  },
];

export function getAgent(id: AgentId | null | undefined): Agent | null {
  if (!id) return null;
  return AGENTS.find((a) => a.id === id) ?? null;
}
