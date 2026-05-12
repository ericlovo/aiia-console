import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppNode, NodeKind } from "../types";
import { BUILTIN_MODELS } from "../types";

type Props = {
  node: AppNode | null;
  onChange: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
};

export function NodeInspector({ node, onChange, onDelete }: Props) {
  if (!node) {
    return (
      <aside className="flex h-full w-80 flex-col border-l border-neutral-800 bg-neutral-950">
        <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Inspector
        </div>
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-neutral-600">
          Select a node to inspect & edit.
        </div>
      </aside>
    );
  }

  const kind = node.type as NodeKind;
  const [models, setModels] = useState<string[]>(BUILTIN_MODELS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const local = await invoke<string[]>("ollama_models");
        if (cancelled) return;
        const localPrefixed = local.map((m) => `ollama-local/${m}`);
        setModels(Array.from(new Set([...BUILTIN_MODELS, ...localPrefixed])));
      } catch {
        // Ollama unreachable; stick with built-ins.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <aside className="flex h-full w-80 flex-col border-l border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {kindLabel(kind)}
        </span>
        <button
          type="button"
          onClick={() => onDelete(node.id)}
          className="text-[10px] text-red-400 hover:text-red-300"
        >
          Delete
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <Field label="Label">
          <input
            value={node.data.label ?? ""}
            onChange={(e) => onChange(node.id, { label: e.target.value })}
            className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-neutral-600 focus:outline-none"
          />
        </Field>

        {kind === "agent" && (
          <>
            <Field label="Model">
              <select
                value={(node.data as { model: string }).model}
                onChange={(e) => onChange(node.id, { model: e.target.value })}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-neutral-600 focus:outline-none"
              >
                {models.map((m: string) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-neutral-600">
                Built-in models + your local Ollama. Routed via the OpenClaw gateway.
              </p>
            </Field>
            <Field label="Prompt">
              <textarea
                rows={6}
                value={(node.data as { prompt: string }).prompt}
                onChange={(e) => onChange(node.id, { prompt: e.target.value })}
                placeholder="System / task prompt for this agent"
                className="w-full resize-y rounded border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-neutral-100 focus:border-neutral-600 focus:outline-none"
              />
            </Field>
            <Field label="Tools (comma-separated)">
              <input
                value={(node.data as { tools: string[] }).tools.join(", ")}
                onChange={(e) =>
                  onChange(node.id, {
                    tools: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="vault.read, vault.write, web.search"
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-neutral-600 focus:outline-none"
              />
            </Field>
          </>
        )}

        {kind === "vaultRead" && (
          <>
            <Field label="Path">
              <input
                value={(node.data as { path: string }).path}
                onChange={(e) => onChange(node.id, { path: e.target.value })}
                placeholder="20-Workstreams/aiia-console.md"
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-neutral-600 focus:outline-none"
              />
            </Field>
            <Field label="Query (optional)">
              <textarea
                rows={4}
                value={(node.data as { query: string }).query}
                onChange={(e) => onChange(node.id, { query: e.target.value })}
                placeholder="dataview-ish filter, glob, or free text"
                className="w-full resize-y rounded border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-neutral-100 focus:border-neutral-600 focus:outline-none"
              />
            </Field>
          </>
        )}

        {kind === "vaultWrite" && (
          <>
            <Field label="Path">
              <input
                value={(node.data as { path: string }).path}
                onChange={(e) => onChange(node.id, { path: e.target.value })}
                placeholder="10-Daily/2026-05-12.md"
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-neutral-600 focus:outline-none"
              />
            </Field>
            <Field label="Section heading">
              <input
                value={(node.data as { section: string }).section}
                onChange={(e) => onChange(node.id, { section: e.target.value })}
                placeholder="Notes"
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-neutral-600 focus:outline-none"
              />
            </Field>
            <Field label="Mode">
              <select
                value={(node.data as { mode?: string }).mode ?? "section"}
                onChange={(e) => onChange(node.id, { mode: e.target.value })}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-neutral-600 focus:outline-none"
              >
                <option value="section">section (replace/append heading)</option>
                <option value="append">append (raw)</option>
                <option value="overwrite">overwrite file</option>
              </select>
            </Field>
          </>
        )}
      </div>

      <div className="border-t border-neutral-800 px-3 py-2 font-mono text-[10px] text-neutral-600">
        id: {node.id}
      </div>
    </aside>
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
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function kindLabel(kind: NodeKind): string {
  switch (kind) {
    case "agent":
      return "Agent";
    case "vaultRead":
      return "Vault Read";
    case "vaultWrite":
      return "Vault Write";
  }
}
