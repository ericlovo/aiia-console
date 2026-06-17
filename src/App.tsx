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
            <ResearchIcon />
          </CornerButton>
          <CornerButton
            label="Journal"
            active={view === "journal"}
            onClick={() => setView(view === "journal" ? "chat" : "journal")}
          >
            <JournalIcon />
          </CornerButton>
          <CornerButton
            label="Memory"
            active={view === "memory"}
            onClick={() => setView(view === "memory" ? "chat" : "memory")}
          >
            <MemoryIcon />
          </CornerButton>
          <CornerButton
            label="Settings"
            active={false}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
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

// ── Nav icons — simple, modern line glyphs (stroke = currentColor) ──────────
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-[18px] w-[18px]",
  "aria-hidden": true,
};

// Research — magnifying glass
function ResearchIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

// Journal — pencil
function JournalIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

// Memory — connected nodes (the memory graph)
function MemoryIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8.2 7.7 15.8 6.6M7.4 9.1 10.9 15.7M16.5 8.6 13.1 15.6" />
      <circle cx="6" cy="7" r="2.3" />
      <circle cx="18" cy="6.5" r="2.3" />
      <circle cx="12" cy="17.5" r="2.3" />
    </svg>
  );
}

// Settings — gear
function SettingsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default App;
