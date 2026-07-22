import { useEffect, useState } from "react";

import { SettingsModal } from "./components/SettingsModal";
import { ChatTab } from "./components/ChatTab";
import { MemoryTab } from "./components/MemoryTab";
import { JournalTab } from "./components/JournalTab";
import { LoopsTab } from "./components/LoopsTab";
import { TodayTab } from "./components/TodayTab";
import "./App.css";

const ACTIVE_VIEW_KEY = "aiia-console-active-tab";

type View = "today" | "chat" | "memory" | "journal" | "loops";

// Today is the home surface (ADR-009): the app opens on what the M4 did.
function readActiveView(): View {
  if (typeof window === "undefined") return "today";
  const raw = window.localStorage.getItem(ACTIVE_VIEW_KEY);
  if (raw === "chat") return "chat";
  if (raw === "memory") return "memory";
  if (raw === "journal") return "journal";
  if (raw === "loops") return "loops";
  return "today";
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
          onClick={() => setView("today")}
          className="flex items-center focus:outline-none"
          aria-label="Today"
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
            label="Chat"
            active={view === "chat"}
            onClick={() => setView(view === "chat" ? "today" : "chat")}
          >
            <ChatIcon />
          </CornerButton>
          <CornerButton
            label="Agents"
            active={view === "loops"}
            onClick={() => setView(view === "loops" ? "today" : "loops")}
          >
            <LoopsIcon />
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
        {view === "today" && <TodayTab />}
        {view === "chat" && <ChatTab />}
        {view === "journal" && <JournalTab />}
        {view === "memory" && <MemoryTab />}
        {view === "loops" && <LoopsTab />}
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

// Chat — speech bubble
function ChatIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

// Loops — circular arrows (the engine gauge)
function LoopsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
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
