import { useEffect, useState } from "react";

import { SettingsModal } from "./components/SettingsModal";
import { ChatTab } from "./components/ChatTab";
import { MemoryTab } from "./components/MemoryTab";
import { Home } from "./components/Home";
import type { AgentId } from "./agents";
import "./App.css";

const ACTIVE_TAB_KEY = "aiia-console-active-tab";
const ACTIVE_AGENT_KEY = "aiia-console-active-agent";

type View = "home" | "chat" | "memory";

function readActiveView(): View {
  if (typeof window === "undefined") return "home";
  const raw = window.localStorage.getItem(ACTIVE_TAB_KEY);
  if (raw === "home" || raw === "chat" || raw === "memory") return raw;
  return "home";
}

function readActiveAgent(): AgentId | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_AGENT_KEY);
  if (
    raw === "tenet" ||
    raw === "writer" ||
    raw === "scribe" ||
    raw === "researcher" ||
    raw === "librarian"
  ) {
    return raw;
  }
  return null;
}

function App() {
  const [view, setView] = useState<View>(readActiveView);
  const [activeAgent, setActiveAgent] = useState<AgentId | null>(readActiveAgent);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_KEY, view);
  }, [view]);

  useEffect(() => {
    if (activeAgent) {
      window.localStorage.setItem(ACTIVE_AGENT_KEY, activeAgent);
    } else {
      window.localStorage.removeItem(ACTIVE_AGENT_KEY);
    }
  }, [activeAgent]);

  const handleSelectAgent = (id: AgentId) => {
    setActiveAgent(id);
    setView("chat");
  };

  const handleHome = () => {
    setActiveAgent(null);
    setView("home");
  };

  const handleMemory = () => {
    setView(view === "memory" ? "home" : "memory");
  };

  return (
    <div className="flex h-screen flex-col bg-void text-text-1">
      {/* Top bar — wordmark left, corner chrome right. No tabs. */}
      <header className="flex items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={handleHome}
          className="flex items-center focus:outline-none"
          aria-label="Home"
        >
          <span
            className="font-display text-lg tracking-[0.40em] text-ink-900 transition-colors hover:text-ink-700"
            style={{ fontWeight: 500 }}
          >
            AIIA
          </span>
        </button>
        <div className="flex items-center gap-1">
          <CornerButton
            label="Memory"
            active={view === "memory"}
            onClick={handleMemory}
          >
            ❦
          </CornerButton>
          <CornerButton
            label="Settings"
            active={false}
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </CornerButton>
        </div>
      </header>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* View body */}
      <div className="flex min-h-0 flex-1">
        {view === "home" && <Home onSelectAgent={handleSelectAgent} />}
        {view === "chat" && <ChatTab agentId={activeAgent} />}
        {view === "memory" && <MemoryTab />}
      </div>
    </div>
  );
}

function CornerButton({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={
        "flex h-9 w-9 items-center justify-center rounded-full text-lg transition-colors focus:outline-none " +
        (active
          ? "bg-vellum-100 text-ink-900"
          : "text-ink-600 hover:bg-vellum-100 hover:text-ink-900")
      }
    >
      {children}
    </button>
  );
}

export default App;
