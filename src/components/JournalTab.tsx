// JournalTab — the journaling surface.
//
// A guided "thinking out loud" loop: press space (or click the orb) to
// begin a session, speak freely, press space again to wrap. The wrap
// pass distills the session into a markdown note and writes it to the
// Obsidian vault under 00-Inbox/, then surfaces a "sessions" entry in
// Memory.
//
// Status: scaffolding. Audio capture, STT, TTS, and the real
// distillation pass land in follow-ups. The state machine and surface
// are wired so the UX can be felt today.

import { useEffect, useMemo, useRef, useState } from "react";

type SessionState = "idle" | "recording" | "wrapping" | "distilled";

const PROMPTS = [
  "What's on your mind?",
  "What needs to be said out loud?",
  "What did today teach you?",
  "What are you turning over?",
  "What deserves the page?",
  "What's the truest thing you can say right now?",
];

function pickPrompt(): string {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function todayHuman(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function JournalTab() {
  const [state, setState] = useState<SessionState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const prompt = useMemo(pickPrompt, []);
  const tickRef = useRef<number | null>(null);

  // Timer — ticks once per second while recording.
  useEffect(() => {
    if (state !== "recording") return;
    tickRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
    };
  }, [state]);

  // Spacebar PTT: idle → recording → wrapping. Ignored when typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      if (state === "idle") setState("recording");
      else if (state === "recording") setState("wrapping");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  // Stubbed distillation — when real wiring lands, this becomes the
  // round-trip to AIIA + a real "save to vault" call.
  useEffect(() => {
    if (state !== "wrapping") return;
    const id = window.setTimeout(() => setState("distilled"), 1800);
    return () => window.clearTimeout(id);
  }, [state]);

  function startNew() {
    setElapsed(0);
    setState("idle");
  }

  return (
    <div className="flex w-full flex-col items-center justify-center px-8 py-12">
      <div className="mb-6 font-display text-sm tracking-[0.25em] uppercase text-text-5">
        {todayHuman()}
      </div>

      {state === "idle" && (
        <IdleSurface prompt={prompt} onBegin={() => setState("recording")} />
      )}
      {state === "recording" && (
        <RecordingSurface elapsed={elapsed} onWrap={() => setState("wrapping")} />
      )}
      {state === "wrapping" && <WrappingSurface elapsed={elapsed} />}
      {state === "distilled" && (
        <DistilledSurface elapsed={elapsed} onStartNew={startNew} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Idle — invitation + big orb. The most important surface; it has to feel
// like opening a notebook, not opening a SaaS app.
// ──────────────────────────────────────────────────────────────────────────

function IdleSurface({ prompt, onBegin }: { prompt: string; onBegin: () => void }) {
  return (
    <div className="flex flex-col items-center gap-12">
      <p className="max-w-md text-center font-display text-3xl leading-snug text-ink-900">
        {prompt}
      </p>

      <MicOrb state="idle" onClick={onBegin} />

      <p className="text-sm text-text-5">
        Press <kbd className="rounded border border-carbon-4 bg-carbon-1 px-1.5 py-0.5 font-mono text-xs">space</kbd>{" "}
        to begin · click the orb · wrap when ready
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Recording — timer, waveform, wrap button. The orb is now breathing.
// ──────────────────────────────────────────────────────────────────────────

function RecordingSurface({
  elapsed,
  onWrap,
}: {
  elapsed: number;
  onWrap: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-10">
      <div className="font-display text-6xl tabular-nums tracking-tight text-ink-900">
        {formatClock(elapsed)}
      </div>

      <MicOrb state="recording" onClick={onWrap} />

      <Waveform />

      <p className="text-sm text-text-5">
        Press <kbd className="rounded border border-carbon-4 bg-carbon-1 px-1.5 py-0.5 font-mono text-xs">space</kbd>{" "}
        again to wrap
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Wrapping — quiet pause while the distillation runs. No spinner; just a
// soft phrase that breathes.
// ──────────────────────────────────────────────────────────────────────────

function WrappingSurface({ elapsed }: { elapsed: number }) {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="font-display text-6xl tabular-nums tracking-tight text-ink-700">
        {formatClock(elapsed)}
      </div>
      <p className="dot-breathe font-display text-2xl text-ink-700">
        Letting it settle…
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Distilled — preview of the markdown that would land in the vault, with
// a start-new affordance. The preview content is mocked for the scaffold;
// real distillation arrives on Sunday.
// ──────────────────────────────────────────────────────────────────────────

function DistilledSurface({
  elapsed,
  onStartNew,
}: {
  elapsed: number;
  onStartNew: () => void;
}) {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6">
      <p className="font-display text-2xl text-ink-900">
        Saved · {formatClock(elapsed)}
      </p>

      <article className="w-full rounded-lg border border-carbon-4 bg-carbon-1 px-8 py-7 text-left">
        <div className="mb-3 font-display text-xs uppercase tracking-[0.25em] text-text-5">
          00-Inbox / {new Date().toISOString().slice(0, 10)}-session.md
        </div>
        <h3 className="mb-3 font-display text-2xl text-ink-900">Session preview</h3>
        <p className="mb-3 text-ink-700">
          <span className="italic text-text-4">
            (Distillation lands here on Sunday — wire STT → AIIA → markdown → vault.)
          </span>
        </p>
        <ul className="ml-5 list-disc space-y-1 text-ink-700">
          <li>Three threads the conversation touched</li>
          <li>One decision worth keeping</li>
          <li>One open question to revisit tomorrow</li>
        </ul>
      </article>

      <button
        type="button"
        onClick={onStartNew}
        className="mt-2 rounded-md border border-ink-700 px-5 py-2 font-display text-sm tracking-wider text-ink-800 transition-colors hover:bg-ink-900 hover:text-vellum-50"
      >
        Begin another
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// MicOrb — the centerpiece. Big, warm, tactile. Idle: vellum on cream.
// Recording: cinnabar with breath. Click = primary action for current state.
// ──────────────────────────────────────────────────────────────────────────

function MicOrb({
  state,
  onClick,
}: {
  state: "idle" | "recording";
  onClick: () => void;
}) {
  const recording = state === "recording";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={recording ? "Wrap session" : "Begin session"}
      className={
        "group relative flex h-32 w-32 items-center justify-center rounded-full transition-all duration-300 focus:outline-none " +
        (recording
          ? "bg-cinnabar-500 text-vellum-50 shadow-[0_0_0_8px_rgba(193,59,42,0.12),0_0_0_18px_rgba(193,59,42,0.06)]"
          : "bg-vellum-100 text-ink-700 hover:bg-vellum-200 hover:text-ink-900 shadow-[0_0_0_8px_rgba(20,17,13,0.04)]")
      }
    >
      <span className={recording ? "dot-breathe" : undefined}>
        <MicGlyph />
      </span>
    </button>
  );
}

function MicGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-12 w-12"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Waveform stub — 14 bars that breathe at slightly different cadences.
// Replaced by a real audio-level visualizer when MediaRecorder is wired.
// ──────────────────────────────────────────────────────────────────────────

function Waveform() {
  const bars = Array.from({ length: 14 });
  return (
    <div className="flex h-10 items-end gap-1.5">
      {bars.map((_, i) => (
        <span
          key={i}
          className="waveform-bar w-1 rounded-full bg-ink-700/40"
          style={{
            animationDelay: `${(i * 73) % 800}ms`,
            animationDuration: `${600 + ((i * 41) % 400)}ms`,
          }}
        />
      ))}
    </div>
  );
}
