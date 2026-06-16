// CaseGeneratorPanel — slide-down inside NewLoopModal.
//
// Asks a local Ollama model for case proposals given a source text. The
// schema-driven NewLoopModal then renders each generated case in the same
// editable cards the user fills in manually — no separate review screen.
//
// v0 routes only to local Ollama; cloud providers (Kimi, DeepSeek, MiniMax,
// Groq) come next via the existing keystore proxy.

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

import {
  loopGenerateCases,
  type AdapterInfo,
  type GeneratedCase,
} from "../../loops/client";

const ERDOS_PRESETS = [
  {
    label: "Erdős problem #65 (ES(7) ≤ 33 conjecture)",
    url: "https://www.erdosproblems.com/65",
  },
  {
    label: "Erdős problem #66 (k-th Erdős–Szekeres number)",
    url: "https://www.erdosproblems.com/66",
  },
  {
    label: "Custom URL / pasted text",
    url: "",
  },
];

type Props = {
  adapter: AdapterInfo | null;
  onProposed: (cases: GeneratedCase[]) => void;
};

export function CaseGeneratorPanel({ adapter, onProposed }: Props) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>("");
  const [presetIdx, setPresetIdx] = useState(0);
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const [sourceText, setSourceText] = useState<string>("");
  const [n, setN] = useState<number>(4);
  const [busy, setBusy] = useState<"fetching" | "generating" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawPeek, setRawPeek] = useState<string>("");

  // Pull the local Ollama model list when the panel opens.
  useEffect(() => {
    if (!open) return;
    invoke<string[]>("ollama_models")
      .then((list) => {
        setModels(list);
        if (list[0] && !model) setModel(list[0]);
      })
      .catch((e) => setError(`ollama unreachable: ${e}`));
  }, [open, model]);

  // Apply preset URL when the dropdown changes.
  useEffect(() => {
    if (presetIdx < ERDOS_PRESETS.length) {
      const preset = ERDOS_PRESETS[presetIdx];
      if (preset.url) setSourceUrl(preset.url);
    }
  }, [presetIdx]);

  const fetchSource = useCallback(async () => {
    if (!sourceUrl.trim()) return;
    setBusy("fetching");
    setError(null);
    try {
      const resp = await fetch(sourceUrl, { method: "GET" });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const text = await resp.text();
      // Strip HTML tags crudely so the model sees readable text.
      const stripped = text
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      // Cap at ~12k chars to keep the prompt manageable.
      setSourceText(stripped.slice(0, 12_000));
    } catch (e) {
      setError(`fetch failed: ${e}`);
    } finally {
      setBusy(null);
    }
  }, [sourceUrl]);

  const generate = useCallback(async () => {
    if (!adapter) {
      setError("pick an adapter first");
      return;
    }
    if (!model.trim()) {
      setError("pick a model");
      return;
    }
    if (!sourceText.trim()) {
      setError("provide source text (fetch a URL or paste)");
      return;
    }
    setBusy("generating");
    setError(null);
    setRawPeek("");
    try {
      const result = await loopGenerateCases({
        adapter_id: adapter.id,
        source_text: sourceText,
        n,
        model,
      });
      setRawPeek(result.raw_response);
      if (result.cases.length === 0) {
        setError("generator returned no cases. See raw response below.");
        return;
      }
      onProposed(result.cases);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }, [adapter, model, sourceText, n, onProposed]);

  return (
    <div className="rounded border border-carbon-4 bg-carbon-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wider text-text-3 hover:text-cinnabar-400"
      >
        <span>{open ? "▾" : "▸"} Generate cases (auto)</span>
        <span className="text-[10px] text-text-5">
          {open ? "" : "expand to use the auto-generator"}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-carbon-4 p-3">
          {error && (
            <div className="rounded border border-status-failing/40 bg-status-failing/10 p-2 text-[11px] text-status-failing">
              {error}
            </div>
          )}

          {/* Source picker */}
          <div className="space-y-1">
            <label className="block text-[10px] uppercase tracking-wider text-text-4">
              Source
            </label>
            <select
              value={presetIdx}
              onChange={(e) => setPresetIdx(Number(e.target.value))}
              className="w-full rounded border border-carbon-4 bg-void px-2 py-1 text-[11px] text-text-1 focus:border-cinnabar-400 focus:outline-none"
            >
              {ERDOS_PRESETS.map((p, i) => (
                <option key={i} value={i}>
                  {p.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.erdosproblems.com/65"
                className="flex-1 rounded border border-carbon-4 bg-void px-2 py-1 font-mono text-[11px] text-text-1 focus:border-cinnabar-400 focus:outline-none"
              />
              <button
                type="button"
                disabled={!sourceUrl.trim() || busy === "fetching"}
                onClick={fetchSource}
                className="rounded border border-carbon-4 px-2 py-1 text-[11px] text-text-2 hover:border-cinnabar-400 hover:text-cinnabar-400 disabled:opacity-40"
              >
                {busy === "fetching" ? "fetching…" : "fetch"}
              </button>
            </div>

            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="…or paste the problem statement / source text here"
              rows={5}
              className="w-full rounded border border-carbon-4 bg-void px-2 py-1 font-mono text-[10px] text-text-1 focus:border-cinnabar-400 focus:outline-none"
            />
            <div className="text-[10px] text-text-5">
              {sourceText.length} chars (capped at 12k on fetch)
            </div>
          </div>

          {/* Model + N */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[10px] uppercase tracking-wider text-text-4">
                Local model (Ollama)
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded border border-carbon-4 bg-void px-2 py-1 text-[11px] text-text-1 focus:border-cinnabar-400 focus:outline-none"
              >
                {models.length === 0 ? (
                  <option value="">(no Ollama models found)</option>
                ) : (
                  models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] uppercase tracking-wider text-text-4">
                Cases to generate
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={n}
                onChange={(e) => setN(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="w-full rounded border border-carbon-4 bg-void px-2 py-1 font-mono text-[11px] text-text-1 focus:border-cinnabar-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={busy !== null || !adapter || !sourceText.trim() || !model}
              onClick={generate}
              className="rounded bg-cinnabar-400 px-3 py-1.5 text-[11px] font-medium text-void hover:bg-cinnabar-500 disabled:opacity-40"
            >
              {busy === "generating" ? "generating…" : "✨ generate cases"}
            </button>
            <span className="text-[10px] text-text-5">
              cases are appended to the list above — you can edit before
              initializing the loop.
            </span>
          </div>

          {rawPeek && (
            <details>
              <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-text-5 hover:text-text-2">
                raw model response
              </summary>
              <pre className="mt-1 max-h-32 overflow-y-auto rounded bg-void p-2 font-mono text-[10px] text-text-3">
                {rawPeek}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
