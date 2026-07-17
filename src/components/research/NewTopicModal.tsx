// NewTopicModal — start a research loop from a question, not a config file.
//
// This is the loop's front door for non-coding users, so the form leads with
// the one thing every loop needs — a question worth chasing — and adapts to
// the three topic kinds the Brain knows how to seed (general / Erdős /
// literature). Seeds are optional plain URLs, one per line.

import { useCallback, useState } from "react";

import {
  createErdosTopic,
  createGeneralTopic,
  createLiteratureTopic,
  type ResearchTopic,
  type TopicKind,
} from "../../research/client";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (topic: ResearchTopic) => void;
};

const KINDS: { id: TopicKind; label: string; blurb: string }[] = [
  {
    id: "general",
    label: "Open question",
    blurb:
      "Any question worth chasing. The best ones are specific enough that a source could actually answer them.",
  },
  {
    id: "erdos",
    label: "Erdős problem",
    blurb:
      "A problem number from erdosproblems.com. The loop seeds itself with the problem page.",
  },
  {
    id: "literature",
    label: "Literature",
    blurb:
      "An author, work, movement, or theme. The loop seeds itself with the Wikipedia article.",
  },
];

function parseSeeds(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function NewTopicModal({ open, onClose, onCreated }: Props) {
  const [kind, setKind] = useState<TopicKind>("general");
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [erdosNumber, setErdosNumber] = useState("");
  const [subject, setSubject] = useState("");
  const [seedsRaw, setSeedsRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      const seeds = parseSeeds(seedsRaw);
      let topic: ResearchTopic;
      if (kind === "general") {
        if (!title.trim() || !question.trim()) {
          setError("A title and a question are both required.");
          return;
        }
        topic = await createGeneralTopic(title.trim(), question.trim(), seeds);
      } else if (kind === "erdos") {
        const n = parseInt(erdosNumber, 10);
        if (!Number.isFinite(n) || n <= 0) {
          setError("Enter a positive Erdős problem number.");
          return;
        }
        topic = await createErdosTopic(n, seeds);
      } else {
        if (!subject.trim()) {
          setError("Enter a subject — an author, work, movement, or theme.");
          return;
        }
        topic = await createLiteratureTopic(subject.trim(), seeds);
      }
      onCreated(topic);
      onClose();
      setTitle("");
      setQuestion("");
      setErdosNumber("");
      setSubject("");
      setSeedsRaw("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [kind, title, question, erdosNumber, subject, seedsRaw, onCreated, onClose]);

  if (!open) return null;

  const activeKind = KINDS.find((k) => k.id === kind)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-carbon-4 bg-carbon-1 shadow-xl">
        <header className="flex items-center justify-between border-b border-carbon-4 px-5 py-3">
          <h2 className="font-display text-base text-ink-900">
            New research topic
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-5 hover:text-ink-900"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-3 rounded border border-status-failing/40 bg-status-failing/10 p-2 text-xs text-status-failing">
              {error}
            </div>
          )}

          {/* Kind picker */}
          <div className="mb-2 flex gap-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={
                  "rounded border px-3 py-1.5 text-xs transition-colors " +
                  (kind === k.id
                    ? "border-cinnabar-400 text-cinnabar-400"
                    : "border-carbon-4 text-text-3 hover:border-carbon-6 hover:text-ink-900")
                }
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="mb-4 text-[11px] leading-relaxed text-text-5">
            {activeKind.blurb}
          </p>

          {kind === "general" && (
            <div className="space-y-3">
              <Field label="Title">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short name for this loop"
                  className="w-full rounded border border-carbon-4 bg-void px-2 py-1.5 text-xs text-text-1 focus:border-cinnabar-400 focus:outline-none"
                />
              </Field>
              <Field label="The question">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={3}
                  placeholder="What should the loop find out?"
                  className="w-full resize-y rounded border border-carbon-4 bg-void px-2 py-1.5 text-xs leading-relaxed text-text-1 focus:border-cinnabar-400 focus:outline-none"
                />
              </Field>
            </div>
          )}

          {kind === "erdos" && (
            <Field label="Problem number">
              <input
                type="number"
                min={1}
                value={erdosNumber}
                onChange={(e) => setErdosNumber(e.target.value)}
                placeholder="e.g. 42"
                className="w-full rounded border border-carbon-4 bg-void px-2 py-1.5 font-mono text-xs text-text-1 focus:border-cinnabar-400 focus:outline-none"
              />
            </Field>
          )}

          {kind === "literature" && (
            <Field label="Subject">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Gerard Manley Hopkins"
                className="w-full rounded border border-carbon-4 bg-void px-2 py-1.5 text-xs text-text-1 focus:border-cinnabar-400 focus:outline-none"
              />
            </Field>
          )}

          <div className="mt-4">
            <Field label="Starting sources (optional, one URL per line)">
              <textarea
                value={seedsRaw}
                onChange={(e) => setSeedsRaw(e.target.value)}
                rows={3}
                placeholder={"https://…\nhttps://…"}
                className="w-full resize-y rounded border border-carbon-4 bg-void px-2 py-1.5 font-mono text-[11px] leading-relaxed text-text-1 focus:border-cinnabar-400 focus:outline-none"
              />
            </Field>
            <p className="mt-1 text-[10px] leading-snug text-text-6">
              The loop reads a few unread sources each session and indexes what
              it learns. You can start with none — it will name the gaps it
              needs filled.
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-carbon-4 bg-carbon-1 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-carbon-4 px-3 py-1.5 text-xs text-text-2 hover:border-carbon-6 hover:text-ink-900"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="rounded bg-cinnabar-400 px-3 py-1.5 text-xs font-medium text-void hover:bg-cinnabar-500 disabled:opacity-40"
          >
            {submitting ? "creating…" : "Create topic"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10px] uppercase tracking-wider text-text-4">
        {label}
      </span>
      {children}
    </label>
  );
}
