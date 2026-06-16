// BeliefCard — renders the YAML frontmatter (as a code block) + the Markdown
// body. The frontmatter is the loop's machine-readable belief; the body is
// the human-readable narrative that humans edit freely.

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { loopBelief, type BeliefView } from "../../loops/client";

export function BeliefCard({ name }: { name: string }) {
  const [belief, setBelief] = useState<BeliefView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetch = () => {
      loopBelief(name)
        .then((b) => !cancelled && setBelief(b))
        .catch((e) => !cancelled && setError(String(e)));
    };
    fetch();
    const id = window.setInterval(fetch, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [name]);

  return (
    <section className="rounded-md border border-carbon-4 bg-carbon-1 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm tracking-wide text-ink-900">
          Belief
        </h3>
        {belief?.exists && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-text-5 hover:text-ink-900"
          >
            {expanded ? "collapse" : "expand"}
          </button>
        )}
      </div>

      {error && <div className="text-xs text-status-error">{error}</div>}

      {!belief ? (
        <div className="text-xs text-text-5">loading…</div>
      ) : !belief.exists ? (
        <div className="text-xs text-text-5">
          No belief file yet. It is created automatically on{" "}
          <code className="font-mono text-[10px]">loop init</code>.
        </div>
      ) : (
        <div className="space-y-3">
          {belief.frontmatter?.yaml_text && (
            <pre className="max-h-48 overflow-y-auto rounded bg-vellum-50 p-2 font-mono text-[10px] leading-snug text-text-3">
              {belief.frontmatter.yaml_text}
            </pre>
          )}
          {expanded && belief.body && (
            <div className="prose prose-sm max-w-none text-text-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {belief.body}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
