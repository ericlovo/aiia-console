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
  devMode: boolean;
  onDevModeChange: (next: boolean) => void;
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
];

export function SettingsModal({ open, onClose, devMode, onDevModeChange }: Props) {
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const map = await invoke<Record<string, boolean>>("keystore_get_keys");
      setPresent(map);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      setStatus({});
      setInputs({});
      refresh();
    }
  }, [open, refresh]);

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
            className="text-xs text-text-4 hover:text-text-2"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="border-b border-status-failing/50 bg-status-failing/30 px-4 py-1.5 text-[11px] text-status-failing">
            {error}
          </div>
        )}

        <div className="space-y-4 p-4">
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

          {/* ---- Developer mode ---- */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-4">
              Developer mode
            </h3>
            <div className="flex items-center justify-between rounded border border-carbon-4 bg-carbon-1/40 p-3">
              <div>
                <div className="text-xs text-text-2">
                  Show developer tab
                </div>
                <div className="text-[10px] text-text-5">
                  Surfaces the visual flow canvas, node palette, and inspector.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={devMode}
                onClick={() => onDevModeChange(!devMode)}
                className={
                  "relative h-5 w-9 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amethyst-500 " +
                  (devMode ? "bg-amethyst-500" : "bg-carbon-7")
                }
              >
                <span
                  className={
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all " +
                    (devMode ? "left-[18px]" : "left-0.5")
                  }
                />
              </button>
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
                        ? "bg-amethyst-700/40 text-amethyst-300"
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
