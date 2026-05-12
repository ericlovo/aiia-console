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
];

export function SettingsModal({ open, onClose }: Props) {
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
        className="w-[520px] max-w-[92vw] rounded-lg border border-neutral-800 bg-neutral-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">
            API Keys
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="border-b border-rose-900/50 bg-rose-950/30 px-4 py-1.5 text-[11px] text-rose-300">
            {error}
          </div>
        )}

        <div className="space-y-3 p-4">
          <p className="text-[11px] leading-relaxed text-neutral-500">
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
                className="rounded border border-neutral-800 bg-neutral-900/40 p-3"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-xs font-medium text-neutral-100">
                    {p.label}
                  </div>
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] " +
                      (configured
                        ? "bg-emerald-900/40 text-emerald-300"
                        : "bg-neutral-800 text-neutral-500")
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
                    className="flex-1 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11px] text-neutral-100 focus:border-neutral-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => save(p.id)}
                    className="rounded bg-emerald-500 px-2 py-1 text-[11px] font-medium text-neutral-950 hover:bg-emerald-400"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => clear(p.id)}
                    disabled={!configured}
                    className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-200 hover:border-rose-500 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
                {note && (
                  <div className="mt-1 text-[10px] text-neutral-500">{note}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
