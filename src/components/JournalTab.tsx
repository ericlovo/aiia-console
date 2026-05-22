// JournalTab — the journaling surface.
//
// A guided "thinking out loud" loop: press space (or click the orb) to begin
// a session, speak freely, press space again to wrap. The wrap pipeline
// captures the audio, transcribes via Groq Whisper, picks the first
// configured chat provider for distillation, streams the distilled markdown
// in live, and writes the final note to the vault under 00-Inbox/.
//
// A raw-transcript fallback is written BEFORE distillation runs, so the
// session is durably saved even if the LLM call later fails.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { useAudioRecorder } from "../journal/useAudioRecorder";
import { transcribe } from "../journal/whisper";
import { distill, pickDistillProvider } from "../journal/distill";
import {
  fallbackMarkdown,
  sessionFilename,
  writeSessionFile,
} from "../journal/vault";

type SessionState = "idle" | "recording" | "wrapping" | "distilled" | "error";

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
  const recorder = useAudioRecorder();
  const [state, setState] = useState<SessionState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string>("");
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const prompt = useMemo(pickPrompt, []);

  const startedAtRef = useRef<Date | null>(null);
  const elapsedTickRef = useRef<number | null>(null);

  // ── Configured-providers probe ─────────────────────────────────────────
  // Refreshed on mount and after each save so the Settings nudge updates if
  // the user adds a key mid-flow.
  const refreshConfigured = useCallback(async () => {
    try {
      const map = await invoke<Record<string, boolean>>("keystore_get_keys");
      setConfigured(map);
    } catch {
      // Non-fatal — UI just shows the nudge.
    }
  }, []);
  useEffect(() => {
    void refreshConfigured();
  }, [refreshConfigured]);

  // ── Timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state !== "recording") return;
    elapsedTickRef.current = window.setInterval(
      () => setElapsed((e) => e + 1),
      1000,
    );
    return () => {
      if (elapsedTickRef.current !== null) window.clearInterval(elapsedTickRef.current);
    };
  }, [state]);

  // ── Begin recording ────────────────────────────────────────────────────
  const beginRecording = useCallback(async () => {
    if (state !== "idle") return;
    setError(null);
    setMarkdown("");
    setSavedPath(null);
    setSubStatus("");
    setElapsed(0);
    try {
      await recorder.start();
      startedAtRef.current = new Date();
      setState("recording");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Couldn't start recording: ${msg}`);
      setState("error");
    }
  }, [recorder, state]);

  // ── Wrap session: stop → transcribe → save raw → distill → save final ─
  const wrapSession = useCallback(async () => {
    if (state !== "recording") return;
    setState("wrapping");
    const startedAt = startedAtRef.current ?? new Date();
    let duration = elapsed;
    let blob: Blob;
    try {
      setSubStatus("Saving audio…");
      const stopped = await recorder.stop();
      blob = stopped.blob;
      // Refine duration from the wall clock — covers the slight delay
      // between space-press and the recorder actually flushing.
      duration = Math.max(
        elapsed,
        Math.floor((Date.now() - startedAt.getTime()) / 1000),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Couldn't finalize recording: ${msg}`);
      setState("error");
      return;
    }

    if (!configured.groq) {
      setError(
        "Groq API key isn't configured yet — open Settings (⚙) and paste your Groq key to enable voice journaling.",
      );
      setState("error");
      return;
    }

    let text = "";
    try {
      setSubStatus("Transcribing with Groq Whisper…");
      text = await transcribe(blob, { provider: "groq" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Transcription failed: ${msg}`);
      setState("error");
      return;
    }

    if (!text.trim()) {
      setError("Whisper returned an empty transcript — did the mic pick up audio?");
      setState("error");
      return;
    }

    // Durably save the raw transcript BEFORE attempting distillation, so a
    // crash or LLM failure can't lose the session.
    const filename = sessionFilename(startedAt);
    const fallback = fallbackMarkdown({
      transcript: text,
      startedAt,
      durationSeconds: duration,
      transcriptionProvider: "groq",
    });
    try {
      setSubStatus("Saving raw transcript…");
      const result = await writeSessionFile(filename, fallback);
      setSavedPath(result.path);
      setMarkdown(fallback);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Couldn't write to vault: ${msg}`);
      setState("error");
      return;
    }

    // Pick a distillation provider from configured keys.
    const distillTarget = pickDistillProvider(configured);
    if (!distillTarget) {
      setSubStatus("");
      setState("distilled");
      return;
    }

    // Distill — stream into the markdown view as it lands.
    try {
      setSubStatus(`Distilling with ${distillTarget.provider}…`);
      let accum = "";
      const distilled = await distill(
        {
          transcript: text,
          startedAt,
          durationSeconds: duration,
          transcriptionProvider: "groq",
        },
        {
          provider: distillTarget.provider,
          model: distillTarget.model,
          onDelta: (delta) => {
            accum += delta;
            setMarkdown(accum);
          },
        },
      );
      // Overwrite the raw-transcript file with the distilled version.
      const finalResult = await writeSessionFile(filename, distilled);
      setSavedPath(finalResult.path);
      setMarkdown(distilled);
      setSubStatus("");
      setState("distilled");
    } catch (e) {
      // Distill failed but raw transcript is safe on disk.
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Distillation failed: ${msg}. Raw transcript saved at ${savedPath ?? filename}.`);
      setState("error");
    }
  }, [configured, elapsed, recorder, savedPath, state]);

  // ── Spacebar PTT ───────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (state === "idle") {
        e.preventDefault();
        void beginRecording();
      } else if (state === "recording") {
        e.preventDefault();
        void wrapSession();
      }
      // wrapping / distilled / error: spacebar does nothing — user clicks
      // "Begin another" or the error CTA explicitly.
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, beginRecording, wrapSession]);

  const startNew = useCallback(() => {
    setElapsed(0);
    setError(null);
    setMarkdown("");
    setSavedPath(null);
    setSubStatus("");
    setState("idle");
    void refreshConfigured();
  }, [refreshConfigured]);

  return (
    <div className="flex w-full flex-col items-center justify-center px-8 py-12">
      <div className="mb-6 font-display text-sm tracking-[0.25em] uppercase text-text-5">
        {todayHuman()}
      </div>

      {state === "idle" && (
        <IdleSurface
          prompt={prompt}
          onBegin={() => void beginRecording()}
          groqConfigured={Boolean(configured.groq)}
        />
      )}
      {state === "recording" && (
        <RecordingSurface elapsed={elapsed} onWrap={() => void wrapSession()} />
      )}
      {state === "wrapping" && (
        <WrappingSurface elapsed={elapsed} status={subStatus} markdown={markdown} />
      )}
      {state === "distilled" && (
        <DistilledSurface
          elapsed={elapsed}
          markdown={markdown}
          path={savedPath}
          onStartNew={startNew}
        />
      )}
      {state === "error" && (
        <ErrorSurface error={error ?? "unknown error"} onRetry={startNew} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Idle — invitation + orb. Surfaces a settings nudge if Groq isn't set up.
// ──────────────────────────────────────────────────────────────────────────

function IdleSurface({
  prompt,
  onBegin,
  groqConfigured,
}: {
  prompt: string;
  onBegin: () => void;
  groqConfigured: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-10">
      <p className="max-w-md text-center font-display text-3xl leading-snug text-ink-900">
        {prompt}
      </p>

      <MicOrb state="idle" onClick={onBegin} disabled={!groqConfigured} />

      {groqConfigured ? (
        <p className="text-sm text-text-5">
          Press{" "}
          <kbd className="rounded border border-carbon-4 bg-carbon-1 px-1.5 py-0.5 font-mono text-xs">
            space
          </kbd>{" "}
          to begin · click the orb · wrap when ready
        </p>
      ) : (
        <p className="max-w-sm text-center text-sm text-cinnabar-600">
          Add your Groq API key in Settings (⚙) to enable voice journaling.
          Free tier covers ~hours of Whisper transcription per day.
        </p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Recording — timer, waveform, wrap.
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
        Press{" "}
        <kbd className="rounded border border-carbon-4 bg-carbon-1 px-1.5 py-0.5 font-mono text-xs">
          space
        </kbd>{" "}
        again to wrap
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Wrapping — substatus line + live markdown stream. The card on the right
// fills as the distillation arrives chunk-by-chunk.
// ──────────────────────────────────────────────────────────────────────────

function WrappingSurface({
  elapsed,
  status,
  markdown,
}: {
  elapsed: number;
  status: string;
  markdown: string;
}) {
  const showStream = markdown.length > 0;
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6">
      <div className="font-display text-5xl tabular-nums tracking-tight text-ink-700">
        {formatClock(elapsed)}
      </div>
      <p className="dot-breathe font-display text-xl text-ink-700">
        {status || "Letting it settle…"}
      </p>
      {showStream && (
        <article className="max-h-[40vh] w-full overflow-auto rounded-lg border border-carbon-4 bg-carbon-1 px-6 py-5 text-left font-mono text-[12px] leading-relaxed text-ink-700 whitespace-pre-wrap">
          {markdown}
        </article>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Distilled — final markdown + path + start-new affordance.
// ──────────────────────────────────────────────────────────────────────────

function DistilledSurface({
  elapsed,
  markdown,
  path,
  onStartNew,
}: {
  elapsed: number;
  markdown: string;
  path: string | null;
  onStartNew: () => void;
}) {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-5">
      <p className="font-display text-2xl text-ink-900">
        Saved · {formatClock(elapsed)}
      </p>

      <article className="max-h-[55vh] w-full overflow-auto rounded-lg border border-carbon-4 bg-carbon-1 px-8 py-7 text-left">
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-ink-700">
          {markdown}
        </pre>
      </article>

      {path && (
        <p className="font-mono text-[11px] text-text-5">
          {path}
        </p>
      )}

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
// Error — soft surface for any failure in the wrap pipeline.
// ──────────────────────────────────────────────────────────────────────────

function ErrorSurface({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex max-w-md flex-col items-center gap-5">
      <p className="text-center font-display text-2xl text-cinnabar-600">
        Something didn't land.
      </p>
      <p className="text-center text-sm leading-relaxed text-ink-700">
        {error}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-ink-700 px-5 py-2 font-display text-sm tracking-wider text-ink-800 transition-colors hover:bg-ink-900 hover:text-vellum-50"
      >
        Try again
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// MicOrb — primary CTA. Idle: vellum on cream. Recording: cinnabar w/ breath.
// Disabled state grays it out (used when Groq isn't configured).
// ──────────────────────────────────────────────────────────────────────────

function MicOrb({
  state,
  onClick,
  disabled = false,
}: {
  state: "idle" | "recording";
  onClick: () => void;
  disabled?: boolean;
}) {
  const recording = state === "recording";
  let surface: string;
  if (disabled) {
    surface = "bg-carbon-3 text-text-6 cursor-not-allowed";
  } else if (recording) {
    surface =
      "bg-cinnabar-500 text-vellum-50 shadow-[0_0_0_8px_rgba(193,59,42,0.12),0_0_0_18px_rgba(193,59,42,0.06)]";
  } else {
    surface =
      "bg-vellum-100 text-ink-700 hover:bg-vellum-200 hover:text-ink-900 shadow-[0_0_0_8px_rgba(20,17,13,0.04)]";
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={recording ? "Wrap session" : "Begin session"}
      className={
        "group relative flex h-32 w-32 items-center justify-center rounded-full transition-all duration-300 focus:outline-none " +
        surface
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
// Real audio-level visualization arrives when MediaRecorder data is wired
// through an AnalyserNode in a follow-up.
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
