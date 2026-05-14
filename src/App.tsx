import { useEffect, useState } from "react";

import { SettingsModal } from "./components/SettingsModal";
import { ChatTab } from "./components/ChatTab";
import { MemoryTab } from "./components/MemoryTab";
import { Home } from "./components/Home";
import type { AgentId } from "./agents";
import "./App.css";

const ACTIVE_TAB_KEY = "aiia-console-active-tab";
const ACTIVE_AGENT_KEY = "aiia-console-active-agent";

type TabId = "home" | "chat" | "memory";

function readActiveTab(): TabId {
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
  const [activeTab, setActiveTab] = useState<TabId>(readActiveTab);
  const [activeAgent, setActiveAgent] = useState<AgentId | null>(readActiveAgent);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (activeAgent) {
      window.localStorage.setItem(ACTIVE_AGENT_KEY, activeAgent);
    } else {
      window.localStorage.removeItem(ACTIVE_AGENT_KEY);
    }
  }, [activeAgent]);

  const handleSelectAgent = (id: AgentId) => {
    setActiveAgent(id);
    setActiveTab("chat");
  };

  const handleHome = () => {
    setActiveAgent(null);
    setActiveTab("home");
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "chat", label: "Chat" },
    { id: "memory", label: "Memory" },
  ];

  return (
    <div className="flex h-screen flex-col bg-void text-text-1">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-carbon-4 bg-void px-6 py-3">
        <button
          type="button"
          onClick={handleHome}
          className="flex items-center gap-2 focus:outline-none"
          aria-label="Home"
        >
          <span
            className="font-display text-lg tracking-[0.40em] text-ink-900"
            style={{ fontWeight: 500 }}
          >
            AIIA
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 hover:bg-vellum-100 hover:text-ink-900 focus:outline-none"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <nav
        role="tablist"
        aria-label="Console sections"
        className="flex items-center gap-1 border-b border-carbon-4 px-6"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={
              "border-b-2 px-3 py-2 text-xs font-medium transition focus:outline-none " +
              (activeTab === t.id
                ? "border-ink-900 text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-800")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Tab body */}
      <div className="flex min-h-0 flex-1">
        {activeTab === "home" && <Home onSelectAgent={handleSelectAgent} />}
        {activeTab === "chat" && <ChatTab agentId={activeAgent} />}
        {activeTab === "memory" && <MemoryTab />}
      </div>
    </div>
  );
}

export default App;
