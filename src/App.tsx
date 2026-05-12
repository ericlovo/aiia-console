import { useEffect, useState } from "react";

import { SettingsModal } from "./components/SettingsModal";
import { ChatTab } from "./components/ChatTab";
import { MemoryTab } from "./components/MemoryTab";
import { DevTab } from "./components/DevTab";
import "./App.css";

const DEV_MODE_KEY = "aiia-console-dev-mode";
const ACTIVE_TAB_KEY = "aiia-console-active-tab";

type TabId = "chat" | "memory" | "dev";

function readDevMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEV_MODE_KEY) === "true";
}

function readActiveTab(devMode: boolean): TabId {
  if (typeof window === "undefined") return "chat";
  const raw = window.localStorage.getItem(ACTIVE_TAB_KEY);
  if (raw === "chat" || raw === "memory") return raw;
  if (raw === "dev" && devMode) return "dev";
  return "chat";
}

function App() {
  const [devMode, setDevMode] = useState<boolean>(readDevMode);
  const [activeTab, setActiveTab] = useState<TabId>(() => readActiveTab(readDevMode()));
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(DEV_MODE_KEY, devMode ? "true" : "false");
    if (!devMode && activeTab === "dev") {
      setActiveTab("chat");
    }
  }, [devMode, activeTab]);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      if (typeof next === "boolean") setDevMode(next);
    };
    window.addEventListener("aiia-console:dev-mode", handler);
    return () => window.removeEventListener("aiia-console:dev-mode", handler);
  }, []);

  const tabs: { id: TabId; label: string }[] = [
    { id: "chat", label: "Chat" },
    { id: "memory", label: "Memory" },
    ...(devMode ? [{ id: "dev" as const, label: "Dev" }] : []),
  ];

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="select-none text-neutral-600"
            title="AIIA Console"
          >
            ≡
          </span>
          <span className="text-base font-semibold tracking-tight text-neutral-100">
            <span aria-hidden className="mr-1.5 text-emerald-400">⌬</span>
            AIIA Console
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-300 hover:border-neutral-500 hover:text-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <nav
        role="tablist"
        aria-label="Console sections"
        className="flex items-center gap-1 border-b border-neutral-800 px-4"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={
              "border-b-2 px-3 py-2 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 " +
              (activeTab === t.id
                ? "border-emerald-500 text-neutral-100"
                : "border-transparent text-neutral-400 hover:text-neutral-200")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        devMode={devMode}
        onDevModeChange={setDevMode}
      />

      {/* Tab body */}
      <div className="flex min-h-0 flex-1">
        {activeTab === "chat" && <ChatTab />}
        {activeTab === "memory" && <MemoryTab />}
        {activeTab === "dev" && devMode && <DevTab />}
      </div>
    </div>
  );
}

export default App;
