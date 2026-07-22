// TodayTab — the proof-of-life home screen (ADR-009).
//
// Answers "what did the M4 do?" on open: this morning's standup brief with
// next-best-actions, every ops loop's last run, the steward's backlog report,
// and the latest code-review findings. All content is read from brain state
// (/v1/loops) and the vault (via the vault_read command) — the Console owns
// nothing.

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";

import {
  brainOpsLoops,
  brainTokensToday,
  type OpsLoop,
  type TokensToday,
} from "../brain/client";

// Plain-language answer to "what was this spend for". Purposes arrive from
// the metering pipeline (ChatRequest.purpose -> Command Center by_purpose).
const PURPOSE_LABELS: Record<string, string> = {
  standup: "Morning standup brief",
  "backlog-steward": "Backlog reconciliation vs commits & PRs",
  "code-review": "Reviewing your commits",
  digest: "Compressing material for a frontier session",
  offload: "Work delegated by a frontier session",
  chat: "Console chat",
  ask: "Answering questions from memory",
  route: "Request routing",
  summarize: "Summarization",
  unattributed: "Untagged (before purpose tracking)",
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const REFRESH_MS = 120_000;

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function vaultRead(path: string): Promise<string | null> {
  try {
    return await invoke<string>("vault_read", { path });
  } catch {
    return null;
  }
}

// Strip YAML frontmatter for display.
function body(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}

function relative(iso?: string): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (Number.isNaN(mins)) return iso;
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export function TodayTab() {
  const [loops, setLoops] = useState<OpsLoop[] | null>(null);
  const [tokens, setTokens] = useState<TokensToday | null>(null);
  const [standup, setStandup] = useState<string | null>(null);
  const [steward, setSteward] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const today = todayISO();
    const [l, tok, daily, stew, rev] = await Promise.all([
      brainOpsLoops().catch(() => null),
      brainTokensToday().catch(() => null),
      vaultRead(`10-Daily/${today}.md`),
      vaultRead("50-Stories/_Steward-Report.md"),
      vaultRead(`80-Resources/code-review-${today}.md`),
    ]);
    setLoops(l);
    setTokens(tok);
    setStandup(daily ? body(daily) : null);
    setSteward(stew ? body(stew) : null);
    setReview(rev ? body(rev) : null);
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  return (
    <div className="flex flex-1 justify-center overflow-y-auto px-6 py-8">
      <div className="w-full max-w-3xl">
        <h1 className="font-display text-xl text-ink-900">Today</h1>
        <p className="mt-1 text-sm text-ink-600">
          What the M4 has done for you — updated as the loops run.
        </p>

        {/* Loop status strip */}
        <div className="mt-5 flex flex-wrap gap-2">
          {loops === null && (
            <span className="text-xs text-ink-600">
              Brain unreachable — loop status unavailable.
            </span>
          )}
          {loops?.map((l) => (
            <span
              key={l.name}
              title={l.last_note ?? ""}
              className="inline-flex items-center gap-1.5 rounded-full border border-carbon-4 bg-vellum-50 px-2.5 py-1 text-xs text-ink-700"
            >
              <span
                className={
                  "h-1.5 w-1.5 rounded-full " +
                  (l.last_status === "ok" ? "bg-mint-600" : "bg-cinnabar-500")
                }
              />
              {l.name}
              <span className="text-ink-600">{relative(l.last_run)}</span>
            </span>
          ))}
        </div>

        {/* Token observability: how much the machine worked, and on what */}
        <section className="mt-6 rounded-xl border border-carbon-4 bg-vellum-50 px-5 py-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-ink-900">Compute spent today</h2>
            {tokens && (
              <span className="text-xs text-ink-600">
                {fmtTokens(tokens.localTokens)} local ·{" "}
                {tokens.cloudTokens > 0
                  ? `${fmtTokens(tokens.cloudTokens)} cloud ($${tokens.totalCost.toFixed(2)})`
                  : "$0 cloud"}
              </span>
            )}
          </div>
          {!tokens && (
            <p className="mt-2 text-xs text-ink-600">
              Brain unreachable — spend unavailable.
            </p>
          )}
          {tokens && tokens.byPurpose.length === 0 && (
            <p className="mt-2 text-xs text-ink-600">
              No attributed spend yet today.
            </p>
          )}
          {tokens && tokens.byPurpose.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {tokens.byPurpose.map((p) => (
                <div key={p.purpose} className="flex items-center gap-3 text-[13px]">
                  <span className="w-24 shrink-0 text-right tabular-nums text-ink-900">
                    {fmtTokens(p.tokens)}
                  </span>
                  <div className="h-1.5 min-w-0 flex-1 rounded-full bg-vellum-100">
                    <div
                      className="h-1.5 rounded-full bg-mint-600"
                      style={{
                        width: `${Math.max(
                          2,
                          (p.tokens / (tokens.byPurpose[0]?.tokens || 1)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="w-72 shrink-0 truncate text-ink-700">
                    {PURPOSE_LABELS[p.purpose] ?? p.purpose}
                    <span className="text-ink-600"> · {p.requests}×</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <Section title="Standup" empty="No daily note yet — the standup loop runs at 07:30.">
          {standup}
        </Section>
        <Section title="Backlog steward" empty="No steward report yet — runs daily at 08:00.">
          {steward}
        </Section>
        <Section title="Code review" empty="No review findings today.">
          {review}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: string | null;
}) {
  return (
    <section className="mt-6 rounded-xl border border-carbon-4 bg-vellum-50 px-5 py-4">
      <h2 className="text-sm font-medium text-ink-900">{title}</h2>
      {children ? (
        <div className="prose prose-sm mt-2 max-w-none text-[13px] leading-relaxed text-ink-700">
          <ReactMarkdown>{children}</ReactMarkdown>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-600">{empty}</p>
      )}
    </section>
  );
}
