// ResearchTab — the Brain's research loop, driven entirely from the app.
//
// Left pane: research topics from GET /v1/research/topics, each one an
// accumulating loop (question → sessions → synthesis + gaps). Right pane:
// the selected topic's loop anatomy (see research/TopicDetail.tsx).
//
// All Brain access funnels through src/research/client.ts → the Rust
// commands in src-tauri/src/research.rs, matching the Memory tab's posture:
// no fetch from JS, keys stay in Rust. When the Brain is unreachable the
// tab degrades to a plain explanation instead of an error wall.

import { useCallback, useEffect, useState } from "react";

import { BrainAuthError } from "../brain/client";
import { listTopics, type ResearchTopic } from "../research/client";
import { NewTopicModal } from "./research/NewTopicModal";
import { TopicDetail } from "./research/TopicDetail";
import { TopicList } from "./research/TopicList";

const LIST_POLL_MS = 10_000;

export function ResearchTab() {
  const [topics, setTopics] = useState<ResearchTopic[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await listTopics();
      setTopics(next);
      setAuthError(false);
      if (next) {
        setSelected((cur) =>
          cur && next.some((t) => t.id === cur) ? cur : (next[0]?.id ?? null),
        );
      }
    } catch (e) {
      if (e instanceof BrainAuthError) setAuthError(true);
      setTopics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, LIST_POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const onCreated = useCallback(
    (topic: ResearchTopic) => {
      setSelected(topic.id);
      refresh();
    },
    [refresh],
  );

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col border-r border-carbon-4 bg-carbon-1">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="font-display text-base tracking-wide text-ink-900">
            Research
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="rounded border border-carbon-4 px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-3 hover:border-cinnabar-400 hover:text-cinnabar-400"
              title="New topic"
              aria-label="New topic"
            >
              + new
            </button>
            <button
              type="button"
              onClick={refresh}
              className="text-xs text-text-5 hover:text-ink-900"
              title="Refresh"
              aria-label="Refresh"
            >
              ↻
            </button>
          </div>
        </div>
        {loading ? (
          <div className="px-4 py-2 text-xs text-text-5">loading…</div>
        ) : topics === null ? (
          <div className="space-y-2 px-4 py-3 text-xs leading-relaxed text-text-5">
            {authError ? (
              <p>
                The Brain rejected your API key. Set it in Settings → API keys
                (id: <code className="font-mono">brain</code>).
              </p>
            ) : (
              <p>
                Brain not detected. Research loops run on the AIIA Brain —
                start it, or point Settings at a remote one.
              </p>
            )}
          </div>
        ) : topics.length === 0 ? (
          <div className="space-y-3 px-4 py-3 text-xs text-text-5">
            <p className="leading-relaxed">
              No research topics yet. A topic is a question the loop chases
              across sessions — reading sources, growing one synthesis, and
              naming what it still doesn't know.
            </p>
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="w-full rounded border border-carbon-4 px-3 py-1.5 text-[11px] text-text-2 hover:border-cinnabar-400 hover:text-cinnabar-400"
            >
              + start your first topic
            </button>
          </div>
        ) : (
          <TopicList
            topics={topics}
            selected={selected}
            onSelect={setSelected}
          />
        )}
      </aside>

      <main className="flex min-h-0 flex-1 flex-col bg-void">
        {selected ? (
          <TopicDetail topicId={selected} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-text-5">
            Select a topic on the left.
          </div>
        )}
      </main>

      <NewTopicModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={onCreated}
      />
    </div>
  );
}
