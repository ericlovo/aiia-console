// TopicDetail — right pane: one research loop, laid out as its own anatomy.
//
// The layout teaches the loop by showing it. Every great research loop has:
//   1. a goal stated as a question        → header
//   2. visible, narrated progress         → stage strip + live session feed
//   3. accumulation across runs           → synthesis card + stats row
//   4. gaps that drive the next turn      → gaps card
//   5. a human checkpoint between turns   → the run-delta summary
//   6. a legible sense of doneness        → converging/complete hints
//
// A session streams REPL events (meta/action/result/done — see
// research/client.ts); we map action names onto the visible stages so the
// user watches the loop move through Gather → Synthesize → Name gaps.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getTopic,
  runSession,
  type ResearchTopic,
  type RunEvent,
  type RunHandle,
} from "../../research/client";

type Stage = "ask" | "gather" | "synthesize" | "gaps" | "again";

const STAGES: { id: Stage; label: string; caption: string }[] = [
  { id: "ask", label: "Ask", caption: "one question worth chasing" },
  { id: "gather", label: "Gather", caption: "read unread sources" },
  { id: "synthesize", label: "Synthesize", caption: "fold findings into one document" },
  { id: "gaps", label: "Name gaps", caption: "say what's still unknown" },
  { id: "again", label: "Run again", caption: "gaps become the next session's goal" },
];

/** Map a REPL action name onto the loop stage it advances. */
function stageFor(action: string): Stage {
  const a = action.toLowerCase();
  if (a.includes("synthesis") || a.includes("answer")) return "synthesize";
  if (a.includes("gap")) return "gaps";
  return "gather";
}

/** Human line for one stream event; null = not worth a feed row. */
function narrate(ev: RunEvent): { text: string; tone: "info" | "ok" | "warn" | "error" } | null {
  switch (ev.type) {
    case "meta":
      return {
        text: `Session started — up to ${ev.max_iterations} steps on ${ev.model}`,
        tone: "info",
      };
    case "action": {
      const a = ev.action.toLowerCase();
      const verb = a.includes("synthesis")
        ? "Updating the synthesis"
        : a.includes("gap")
          ? "Logging a gap"
          : a.includes("answer")
            ? "Drafting the answer"
            : `Working: ${ev.action.replace(/_/g, " ")}`;
      return { text: `Step ${ev.iteration + 1} · ${verb}`, tone: "info" };
    }
    case "result":
      return ev.ok
        ? null // the next action line carries the story; keep the feed calm
        : { text: `Step ${ev.iteration + 1} failed: ${ev.preview.slice(0, 120)}`, tone: "warn" };
    case "fallback":
      return { text: `Wrapping up early: ${ev.reason}`, tone: "warn" };
    case "error":
      return { text: ev.message, tone: "error" };
    case "done":
      return {
        text: `Session complete — ${ev.iterations} steps`,
        tone: "ok",
      };
  }
}

type Snapshot = {
  runCount: number;
  sources: number;
  gaps: number;
  synthesisChars: number;
};

function snapshot(t: ResearchTopic): Snapshot {
  return {
    runCount: t.run_count,
    sources: t.sources_indexed.length,
    gaps: t.gaps.length,
    synthesisChars: t.synthesis.length,
  };
}

/** The checkpoint copy: what changed this run, and what it means. */
function deltaCoach(before: Snapshot, after: Snapshot, seedCount: number): string[] {
  const lines: string[] = [];
  const newSources = after.sources - before.sources;
  if (newSources > 0) {
    lines.push(`${newSources} new ${newSources === 1 ? "source" : "sources"} read and indexed.`);
  } else if (seedCount === 0) {
    lines.push(
      "This session read no sources — the topic has none to read, so the loop worked from thin air. Treat the synthesis with suspicion and add starting sources.",
    );
  } else {
    lines.push(
      "No sources were read this session even though the topic has some — fetches may be failing. Check the session feed above.",
    );
  }
  if (after.gaps > before.gaps) {
    lines.push(
      `Open gaps grew ${before.gaps} → ${after.gaps}. Early on, more gaps is progress — the loop now knows what it doesn't know.`,
    );
  } else if (after.gaps < before.gaps) {
    lines.push(
      `Open gaps closed ${before.gaps} → ${after.gaps}. The loop is converging.`,
    );
  } else if (after.gaps > 0) {
    lines.push(`Open gaps held at ${after.gaps} — consider adding a source that speaks to them.`);
  }
  if (after.synthesisChars > before.synthesisChars) {
    lines.push("The synthesis grew. Read it below, then decide: run again, or refine the question.");
  }
  if (lines.length === 0) {
    lines.push("Nothing measurably changed this run — a sign to add sources or sharpen the question.");
  }
  return lines;
}

type FeedLine = { text: string; tone: "info" | "ok" | "warn" | "error" };

export function TopicDetail({ topicId }: { topicId: string }) {
  const [topic, setTopic] = useState<ResearchTopic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [delta, setDelta] = useState<string[] | null>(null);
  const handleRef = useRef<RunHandle | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  // Consecutive identical failing actions — collapsed into one coach line so
  // a small model spinning on a bad step doesn't flood the feed with noise.
  const failStreakRef = useRef<{ action: string; count: number }>({
    action: "",
    count: 0,
  });

  const refresh = useCallback(async () => {
    try {
      const t = await getTopic(topicId);
      setTopic(t);
      setError(t ? null : "Brain not reachable");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [topicId]);

  useEffect(() => {
    setFeed([]);
    setDelta(null);
    setStage(null);
    refresh();
  }, [refresh]);

  // Cancel a live session if the user navigates away mid-run.
  useEffect(() => {
    return () => handleRef.current?.cancel();
  }, [topicId]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed]);

  const onRun = useCallback(async () => {
    if (!topic || running) return;
    const before = snapshot(topic);
    setRunning(true);
    setDelta(null);
    setFeed([]);
    setStage("ask");

    failStreakRef.current = { action: "", count: 0 };
    const handle = runSession(topic.id, (ev) => {
      if (ev.type === "action") setStage(stageFor(ev.action));
      if (ev.type === "done") setStage("again");

      // Collapse a failure streak: show the first two identical failures,
      // then one honest coach line, then silence until the streak breaks.
      if (ev.type === "result" && !ev.ok) {
        const streak = failStreakRef.current;
        if (streak.action === ev.action) {
          streak.count += 1;
          if (streak.count === 3) {
            setFeed((f) => [
              ...f,
              {
                text: `The model keeps repeating the same failing step ("${ev.action}"). It may not have the sources it's looking for — stopping this session and adding sources is usually the fix.`,
                tone: "warn",
              },
            ]);
          }
          if (streak.count >= 3) return;
        } else {
          failStreakRef.current = { action: ev.action, count: 1 };
        }
      } else if (ev.type === "result" || ev.type === "action") {
        if (ev.type === "result") failStreakRef.current = { action: "", count: 0 };
      }

      const line = narrate(ev);
      if (line) setFeed((f) => [...f, line]);
    });
    handleRef.current = handle;

    try {
      await handle.finished;
      const after = await getTopic(topic.id);
      if (after) {
        setTopic(after);
        setDelta(deltaCoach(before, snapshot(after), after.seeds.length));
      }
    } catch (e) {
      setFeed((f) => [
        ...f,
        { text: e instanceof Error ? e.message : String(e), tone: "error" },
      ]);
      await refresh();
    } finally {
      handleRef.current = null;
      setRunning(false);
      setStage(null);
    }
  }, [topic, running, refresh]);

  const onStop = useCallback(() => {
    handleRef.current?.cancel();
  }, []);

  if (error && !topic) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-text-5">
        {error}
      </div>
    );
  }
  if (!topic) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-5">
        loading…
      </div>
    );
  }

  const converging =
    topic.run_count > 0 && topic.gaps.length === 0 && topic.status === "active";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* 1 · The goal */}
      <header className="border-b border-carbon-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg tracking-wide text-ink-900">
            {topic.title}
          </h2>
          <span className="rounded-full bg-carbon-3 px-2 py-0.5 text-[9px] uppercase tracking-wider text-text-3">
            {topic.profile}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-text-5">
            {topic.status}
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-2">
          {topic.question}
        </p>
        <p className="mt-2 text-[11px] text-text-5">
          {topic.run_count} {topic.run_count === 1 ? "session" : "sessions"} ·{" "}
          {topic.sources_indexed.length} sources indexed ·{" "}
          {topic.gaps.length} open {topic.gaps.length === 1 ? "gap" : "gaps"}
        </p>
      </header>

      {/* 2 · The loop, visible */}
      <div className="border-b border-carbon-4 px-6 py-4">
        <ol className="flex flex-wrap items-start gap-x-1 gap-y-2">
          {STAGES.map((s, i) => {
            const active = stage === s.id;
            return (
              <li key={s.id} className="flex items-start gap-1">
                <div
                  className={
                    "flex max-w-[9.5rem] flex-col rounded border px-3 py-2 transition-colors " +
                    (active
                      ? "border-cinnabar-400 bg-cinnabar-400/10"
                      : "border-carbon-4")
                  }
                >
                  <span
                    className={
                      "text-[10px] font-semibold uppercase tracking-wider " +
                      (active ? "text-cinnabar-400" : "text-text-3")
                    }
                  >
                    {i + 1} · {s.label}
                  </span>
                  <span className="mt-0.5 text-[10px] leading-snug text-text-5">
                    {s.caption}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <span className="mt-3 text-text-6">→</span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex items-center gap-3">
          {running ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded border border-status-failing/60 px-3 py-1.5 text-xs text-status-failing hover:bg-status-failing/10"
            >
              Stop session
            </button>
          ) : (
            <button
              type="button"
              onClick={onRun}
              disabled={topic.status === "complete"}
              className="rounded bg-cinnabar-400 px-3 py-1.5 text-xs font-medium text-void hover:bg-cinnabar-500 disabled:opacity-40"
            >
              Run a session
            </button>
          )}
          <span className="text-[11px] text-text-5">
            {topic.status === "complete"
              ? "This topic is marked complete."
              : running
                ? "Watch the loop work — each step lands below."
                : topic.run_count === 0
                  ? "One session ≈ a focused reading-and-thinking pass on your question."
                  : "Each session picks up where the last one stopped."}
          </span>
        </div>

        {/* Live narrated feed */}
        {feed.length > 0 && (
          <div className="mt-3 max-h-48 overflow-y-auto rounded border border-carbon-4 bg-void p-3">
            <ul className="space-y-1">
              {feed.map((l, i) => (
                <li
                  key={i}
                  className={
                    "text-[11px] leading-relaxed " +
                    (l.tone === "error"
                      ? "text-status-failing"
                      : l.tone === "warn"
                        ? "text-status-attention"
                        : l.tone === "ok"
                          ? "text-ink-900"
                          : "text-text-4")
                  }
                >
                  {l.text}
                </li>
              ))}
            </ul>
            <div ref={feedEndRef} />
          </div>
        )}

        {/* 5 · The checkpoint */}
        {delta && (
          <div className="mt-3 rounded border border-carbon-4 bg-carbon-2 p-3">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-text-3">
              What this run changed
            </h4>
            <ul className="mt-1 space-y-1">
              {delta.map((d, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-text-2">
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 3 + 4 · What it knows / what it knows it doesn't */}
      <div className="grid flex-1 grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <section className="rounded border border-carbon-4 bg-carbon-1 p-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-3">
            Synthesis — what the loop knows so far
          </h3>
          {topic.synthesis ? (
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-text-1">
              {topic.synthesis}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-text-5">
              Empty until the first session runs. The synthesis is the loop's
              one accumulating document — every run folds new findings into it
              rather than starting over.
            </p>
          )}
        </section>

        <section className="rounded border border-carbon-4 bg-carbon-1 p-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-3">
            Open gaps — what it knows it doesn't know
          </h3>
          {topic.gaps.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {topic.gaps.map((g, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-text-1">
                  <span className="text-cinnabar-400">◦</span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-text-5">
              {converging
                ? "No open gaps. That usually means the loop has converged on this question — read the synthesis and judge for yourself. To push further, refine the question into a new topic."
                : "Gaps appear as the loop reads: each one is a question it couldn't answer yet. They're fuel — the next session starts from them."}
            </p>
          )}
          {topic.gaps.length > 0 && (
            <p className="mt-3 border-t border-carbon-3 pt-2 text-[10px] leading-snug text-text-6">
              These drive the next run. A loop that names its gaps is a loop
              you can trust to improve.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
