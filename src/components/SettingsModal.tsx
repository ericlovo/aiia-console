// SettingsModal — manage API keys for the remote model providers.
//
// The modal never reads plaintext keys back from the Rust side; it can only
// see whether a key is configured (keystore_get_keys returns presence
// booleans). Saving a key issues keystore_set_key with the typed value;
// "Clear" issues keystore_delete_key. The masked input is for entry only.

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Props = {
  open: boolean;
  onClose: () => void;
};

type ProviderRow = {
  id: string;
  label: string;
};

const PROVIDERS: ProviderRow[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "moonshot", label: "Moonshot (Kimi)" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "google", label: "Google (Gemini)" },
  { id: "groq", label: "Groq (Llama + Whisper STT)" },
];

export function SettingsModal({ open, onClose }: Props) {
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Connection (remote Brain over Tailscale, etc.)
  const [brainUrl, setBrainUrl] = useState("");
  const [brainUrlDraft, setBrainUrlDraft] = useState("");
  const [brainKeyDraft, setBrainKeyDraft] = useState("");
  const [connNote, setConnNote] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  const refresh = useCallback(async () => {
    try {
      const map = await invoke<Record<string, boolean>>("keystore_get_keys");
      setPresent(map);
      const url = await invoke<string>("brain_get_url");
      setBrainUrl(url);
      setBrainUrlDraft(url);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      setStatus({});
      setInputs({});
      setConnNote(null);
      setTestResult(null);
      setBrainKeyDraft("");
      refresh();
    }
  }, [open, refresh]);

  const saveBrainUrl = useCallback(async () => {
    try {
      await invoke("brain_set_url", { url: brainUrlDraft.trim() });
      setConnNote("Brain URL saved");
      setTestResult(null);
      await refresh();
    } catch (e) {
      setConnNote(`error: ${String(e)}`);
    }
  }, [brainUrlDraft, refresh]);

  const saveBrainKey = useCallback(async () => {
    const key = brainKeyDraft.trim();
    if (!key) {
      setConnNote("enter a key first");
      return;
    }
    try {
      await invoke("keystore_set_key", { provider: "brain", key });
      setConnNote("Brain key saved");
      setBrainKeyDraft("");
      await refresh();
    } catch (e) {
      setConnNote(`error: ${String(e)}`);
    }
  }, [brainKeyDraft, refresh]);

  const clearBrainKey = useCallback(async () => {
    try {
      await invoke("keystore_delete_key", { provider: "brain" });
      setConnNote("Brain key cleared");
      setBrainKeyDraft("");
      await refresh();
    } catch (e) {
      setConnNote(`error: ${String(e)}`);
    }
  }, [refresh]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const raw = await invoke<unknown>("brain_status");
      if (raw && typeof raw === "object") {
        const identity =
          (raw as Record<string, unknown>).identity ??
          (raw as Record<string, unknown>).name;
        setTestResult({
          ok: true,
          message: `Connected${identity ? ` — ${String(identity)}` : ""}`,
        });
      } else {
        setTestResult({ ok: false, message: "Brain not reachable" });
      }
    } catch (e) {
      setTestResult({ ok: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const save = useCallback(
    async (id: string) => {
      const key = (inputs[id] ?? "").trim();
      if (!key) {
        setStatus((s) => ({ ...s, [id]: "enter a key first" }));
        return;
      }
      try {
        await invoke("keystore_set_key", { provider: id, key });
        setStatus((s) => ({ ...s, [id]: "saved" }));
        setInputs((s) => ({ ...s, [id]: "" }));
        await refresh();
      } catch (e) {
        setStatus((s) => ({ ...s, [id]: `error: ${String(e)}` }));
      }
    },
    [inputs, refresh],
  );

  const clear = useCallback(
    async (id: string) => {
      try {
        await invoke("keystore_delete_key", { provider: id });
        setStatus((s) => ({ ...s, [id]: "cleared" }));
        setInputs((s) => ({ ...s, [id]: "" }));
        await refresh();
      } catch (e) {
        setStatus((s) => ({ ...s, [id]: `error: ${String(e)}` }));
      }
    },
    [refresh],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[92vw] rounded-lg border border-carbon-4 bg-void shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-carbon-4 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-1">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-text-4 transition-colors hover:bg-vellum-100 hover:text-text-1 focus:outline-none"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="border-b border-status-failing/50 bg-status-failing/30 px-4 py-1.5 text-[11px] text-status-failing">
            {error}
          </div>
        )}

        <div className="space-y-4 p-4">
          {/* ---- Connection ---- */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-4">
              Connection
            </h3>
            <p className="mb-2 text-[11px] leading-relaxed text-text-5">
              Point the console at an AIIA Brain. Use a Tailscale host to reach a
              Brain on another machine (e.g.{" "}
              <code className="font-mono">http://mac-mini.tailnet.ts.net:8100</code>
              ). Leave blank to use <code className="font-mono">localhost:8100</code>.
            </p>
            <div className="space-y-2 rounded border border-carbon-4 bg-carbon-1/40 p-3">
              <label className="block">
                <span className="mb-1 block text-[11px] text-text-4">Brain URL</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={brainUrlDraft}
                    onChange={(e) => setBrainUrlDraft(e.target.value)}
                    placeholder="http://127.0.0.1:8100"
                    spellCheck={false}
                    className="flex-1 rounded border border-carbon-4 bg-void px-2 py-1 font-mono text-[11px] text-text-1 focus:border-carbon-7 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={saveBrainUrl}
                    className="rounded bg-amethyst-500 px-2 py-1 text-[11px] font-medium text-void hover:bg-amethyst-400"
                  >
                    Save
                  </button>
                </div>
                <span className="mt-1 block text-[10px] text-text-5">
                  Currently using: <span className="font-mono">{brainUrl || "—"}</span>
                </span>
              </label>

              <label className="block">
                <span className="mb-1 flex items-center justify-between text-[11px] text-text-4">
                  <span>Brain API key (optional)</span>
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] " +
                      (present.brain
                        ? "bg-status-healthy/15 text-status-healthy"
                        : "bg-carbon-3 text-text-5")
                    }
                  >
                    {present.brain ? "configured" : "not set"}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={brainKeyDraft}
                    onChange={(e) => setBrainKeyDraft(e.target.value)}
                    placeholder={
                      present.brain ? "•••••• (enter new to replace)" : "LOCAL_BRAIN_API_KEY"
                    }
                    className="flex-1 rounded border border-carbon-4 bg-void px-2 py-1 font-mono text-[11px] text-text-1 focus:border-carbon-7 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={saveBrainKey}
                    className="rounded bg-amethyst-500 px-2 py-1 text-[11px] font-medium text-void hover:bg-amethyst-400"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={clearBrainKey}
                    disabled={!present.brain}
                    className="rounded border border-carbon-6 bg-carbon-1 px-2 py-1 text-[11px] text-text-2 hover:border-status-failing hover:text-status-failing disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
                <span className="mt-1 block text-[10px] text-text-5">
                  Sent as <code className="font-mono">x-api-key</code>. Must match the
                  Brain&apos;s <code className="font-mono">LOCAL_BRAIN_API_KEY</code>.
                </span>
              </label>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testing}
                  className="rounded border border-carbon-6 bg-carbon-1 px-2 py-1 text-[11px] text-text-2 hover:border-carbon-7 hover:text-text-1 disabled:opacity-40"
                >
                  {testing ? "Testing…" : "Test connection"}
                </button>
                {testResult && (
                  <span
                    className={
                      "text-[11px] " +
                      (testResult.ok ? "text-status-healthy" : "text-status-failing")
                    }
                  >
                    {testResult.message}
                  </span>
                )}
              </div>

              {connNote && (
                <div className="text-[10px] text-text-5">{connNote}</div>
              )}
            </div>
          </section>

          {/* ---- Appearance ---- */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-4">
              Appearance
            </h3>
            <div className="flex items-center justify-between rounded border border-carbon-4 bg-carbon-1/40 p-3">
              <label
                htmlFor="theme-select"
                className="text-xs text-text-2"
              >
                Theme
              </label>
              <select
                id="theme-select"
                disabled
                value="dark"
                className="rounded border border-carbon-4 bg-void px-2 py-1 text-[11px] text-text-4 disabled:cursor-not-allowed"
              >
                <option value="dark">Dark (only option for now)</option>
              </select>
            </div>
          </section>

          {/* ---- API Keys ---- */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-4">
              API Keys
            </h3>
          <p className="text-[11px] leading-relaxed text-text-5">
            Keys are stored in <code className="font-mono">~/.aiia/keys.json</code> with 0600
            permissions. They never leave the Rust side; the JS layer only sees whether each
            provider is configured.
          </p>

          {PROVIDERS.map((p) => {
            const configured = Boolean(present[p.id]);
            const value = inputs[p.id] ?? "";
            const note = status[p.id];
            return (
              <div
                key={p.id}
                className="rounded border border-carbon-4 bg-carbon-1/40 p-3"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-xs font-medium text-text-1">
                    {p.label}
                  </div>
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] " +
                      (configured
                        ? "bg-status-healthy/15 text-status-healthy"
                        : "bg-carbon-3 text-text-5")
                    }
                  >
                    {configured ? "configured" : "not set"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={value}
                    onChange={(e) =>
                      setInputs((s) => ({ ...s, [p.id]: e.target.value }))
                    }
                    placeholder={configured ? "•••••• (enter new to replace)" : "paste API key"}
                    className="flex-1 rounded border border-carbon-4 bg-void px-2 py-1 font-mono text-[11px] text-text-1 focus:border-carbon-7 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => save(p.id)}
                    className="rounded bg-amethyst-500 px-2 py-1 text-[11px] font-medium text-void hover:bg-amethyst-400"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => clear(p.id)}
                    disabled={!configured}
                    className="rounded border border-carbon-6 bg-carbon-1 px-2 py-1 text-[11px] text-text-2 hover:border-status-failing hover:text-status-failing disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
                {note && (
                  <div className="mt-1 text-[10px] text-text-5">{note}</div>
                )}
              </div>
            );
          })}
          </section>
        </div>
      </div>
    </div>
  );
}
