import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppNode, NodeKind } from "../types";
import { getProviderModelId } from "../types";
import {
  listAllModels,
  listProviders,
} from "../providers";
import type { ModelInfo, ProviderInfo } from "../providers/types";

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
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [keysPresent, setKeysPresent] = useState<Record<string, boolean>>({});
  const providers: ProviderInfo[] = listProviders();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [all, keys] = await Promise.all([
        listAllModels(),
        invoke<Record<string, boolean>>("keystore_get_keys").catch(
          () => ({} as Record<string, boolean>),
        ),
      ]);
      if (cancelled) return;
      setModels(all);
      setKeysPresent(keys);
    })();
    return () => {
      cancelled = true;
    };
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
                value={getProviderModelId(
                  node.data as { providerModelId?: string; model?: string },
                )}
                onChange={(e) =>
                  onChange(node.id, {
                    providerModelId: e.target.value,
                    // Clear the legacy field so the new value sticks on save.
                    model: undefined,
                  })
                }
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-neutral-600 focus:outline-none"
              >
                {renderGroupedModelOptions(models, providers, keysPresent)}
              </select>
              <p className="mt-1 text-[10px] text-neutral-600">
                Local + remote providers. Remote needs an API key (gear icon).
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

function renderGroupedModelOptions(
  models: ModelInfo[],
  providers: ProviderInfo[],
  keysPresent: Record<string, boolean>,
) {
  // Group by provider id, ordered with locals first, then remotes alphabetical.
  const byProvider = new Map<string, ModelInfo[]>();
  for (const m of models) {
    if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
    byProvider.get(m.provider)!.push(m);
  }
  const locals = providers.filter((p) => p.kind === "local");
  const remotes = providers
    .filter((p) => p.kind === "remote")
    .sort((a, b) => a.label.localeCompare(b.label));

  const renderGroup = (groupLabel: string, infos: ProviderInfo[]) => (
    <optgroup key={groupLabel} label={groupLabel}>
      {infos.flatMap((p) => {
        const list = byProvider.get(p.id) ?? [];
        const needsKey = p.kind === "remote" && !keysPresent[p.id];
        if (list.length === 0) {
          // Show a disabled placeholder so the provider is at least visible.
          return [
            <option key={`${p.id}-none`} value="" disabled>
              {p.label} (no models)
            </option>,
          ];
        }
        return list.map((m) => (
          <option
            key={`${m.provider}:${m.id}`}
            value={`${m.provider}:${m.id}`}
            disabled={needsKey}
          >
            {p.label} / {m.label}
            {needsKey ? " — needs key" : ""}
          </option>
        ));
      })}
    </optgroup>
  );

  return (
    <>
      {renderGroup("Local", locals)}
      {renderGroup("Remote", remotes)}
    </>
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
