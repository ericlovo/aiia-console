import { useEffect, useState } from "react";

import { SettingsModal } from "./components/SettingsModal";
import { ChatTab } from "./components/ChatTab";
import { MemoryTab } from "./components/MemoryTab";
import { JournalTab } from "./components/JournalTab";
import { ResearchTab } from "./components/ResearchTab";
import "./App.css";

const ACTIVE_VIEW_KEY = "aiia-console-active-tab";

type View = "chat" | "memory" | "journal" | "research";

function readActiveView(): View {
  if (typeof window === "undefined") return "chat";
  const raw = window.localStorage.getItem(ACTIVE_VIEW_KEY);
  if (raw === "memory") return "memory";
  if (raw === "journal") return "journal";
  if (raw === "research") return "research";
  return "chat";
}

function App() {
  const [view, setView] = useState<View>(readActiveView);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_VIEW_KEY, view);
  }, [view]);

  return (
    <div className="flex h-screen flex-col bg-void text-text-1">
      {/* Top bar — wordmark left, corner chrome right. */}
      <header className="flex items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={() => setView("chat")}
          className="flex items-center focus:outline-none"
          aria-label="Chat"
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
            label="Research"
            active={view === "research"}
            onClick={() => setView(view === "research" ? "chat" : "research")}
          >
            ⟳
          </CornerButton>
          <CornerButton
            label="Journal"
            active={view === "journal"}
            onClick={() => setView(view === "journal" ? "chat" : "journal")}
          >
            ✒
          </CornerButton>
          <CornerButton
            label="Memory"
            active={view === "memory"}
            onClick={() => setView(view === "memory" ? "chat" : "memory")}
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
        {view === "chat" && <ChatTab />}
        {view === "journal" && <JournalTab />}
        {view === "memory" && <MemoryTab />}
        {view === "research" && <ResearchTab />}
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
