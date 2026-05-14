import { useEffect, useState } from "react";

import { SettingsModal } from "./components/SettingsModal";
import { ChatTab } from "./components/ChatTab";
import { MemoryTab } from "./components/MemoryTab";
import "./App.css";

const ACTIVE_TAB_KEY = "aiia-console-active-tab";

type TabId = "chat" | "memory";

function readActiveTab(): TabId {
  if (typeof window === "undefined") return "chat";
  const raw = window.localStorage.getItem(ACTIVE_TAB_KEY);
  if (raw === "chat" || raw === "memory") return raw;
  return "chat";
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>(readActiveTab);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "chat", label: "Chat" },
    { id: "memory", label: "Memory" },
  ];

  return (
    <div className="flex h-screen flex-col bg-void text-text-1">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-carbon-4 bg-void px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="select-none text-text-6"
            title="AIIA Console"
          >
            ≡
          </span>
          <span className="text-base font-semibold tracking-tight text-text-1">
            <span aria-hidden className="mr-1.5 text-amethyst-400">⌬</span>
            AIIA Console
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-carbon-6 bg-carbon-1 text-sm text-text-3 hover:border-carbon-7 hover:text-text-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amethyst-500"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <nav
        role="tablist"
        aria-label="Console sections"
        className="flex items-center gap-1 border-b border-carbon-4 px-4"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={
              "border-b-2 px-3 py-2 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amethyst-500 " +
              (activeTab === t.id
                ? "border-amethyst-500 text-text-1"
                : "border-transparent text-text-4 hover:text-text-2")
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
        {activeTab === "chat" && <ChatTab />}
        {activeTab === "memory" && <MemoryTab />}
      </div>
    </div>
  );
}

export default App;
