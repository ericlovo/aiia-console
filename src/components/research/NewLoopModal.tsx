// NewLoopModal — schema-driven loop creation, bypassing the CLI.
//
// The modal pulls adapter schemas via loop_adapters_available, then builds
// per-case forms from each schema's case_params. Users can add multiple cases,
// override defaults, and ship the whole thing to loop_create in one POST.
//
// Design intent: the *adapter* is the source of truth for what variables a
// case takes. To add a new domain (e.g. Path B obscure-Erdős-problems lit
// review), drop a JSON schema next to the Python adapter file and it appears
// here for free.

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  loopAdaptersAvailable,
  loopCreate,
  type AdapterInfo,
  type CreateCase,
  type GeneratedCase,
  type ParamSpec,
} from "../../loops/client";
import { CaseGeneratorPanel } from "./CaseGeneratorPanel";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
};

type CaseDraft = {
  case_id: string;
  note: string;
  rationale: string;
  params: Record<string, string>; // all values held as strings; coerced on submit
};

function defaultsFor(adapter: AdapterInfo): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of adapter.case_params) {
    out[p.key] = p.default == null ? "" : String(p.default);
  }
  return out;
}

function blankCase(adapter: AdapterInfo, idx: number): CaseDraft {
  return {
    case_id: `case_${String(idx + 1).padStart(3, "0")}`,
    note: "",
    rationale: "",
    params: defaultsFor(adapter),
  };
}

function coerce(value: string, type: ParamSpec["type"]): unknown {
  if (type === "int") {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : value;
  }
  if (type === "float") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : value;
  }
  if (type === "bool") {
    return value === "true" || value === "1";
  }
  return value;
}

export function NewLoopModal({ open, onClose, onCreated }: Props) {
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [adapterId, setAdapterId] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [budgetCompute, setBudgetCompute] = useState<string>("86400");
  const [budgetWallclock, setBudgetWallclock] = useState<string>("");
  const [budgetDollars, setBudgetDollars] = useState<string>("");
  const [cases, setCases] = useState<CaseDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adapter = useMemo(
    () => adapters.find((a) => a.id === adapterId) ?? null,
    [adapters, adapterId],
  );

  // Load adapter list when the modal opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    loopAdaptersAvailable()
      .then((list) => {
        setAdapters(list);
        if (list[0] && !adapterId) {
          setAdapterId(list[0].id);
        }
      })
      .catch((e) => setError(String(e)));
  }, [open, adapterId]);

  // Reset cases when adapter changes.
  useEffect(() => {
    if (adapter) {
      setCases([blankCase(adapter, 0)]);
    } else {
      setCases([]);
    }
  }, [adapter]);

  const addCase = useCallback(() => {
    if (!adapter) return;
    setCases((cs) => [...cs, blankCase(adapter, cs.length)]);
  }, [adapter]);

  const removeCase = useCallback((idx: number) => {
    setCases((cs) => cs.filter((_, i) => i !== idx));
  }, []);

  const updateCase = useCallback(
    (idx: number, patch: Partial<CaseDraft>) => {
      setCases((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
    },
    [],
  );

  const updateParam = useCallback(
    (idx: number, key: string, value: string) => {
      setCases((cs) =>
        cs.map((c, i) =>
          i === idx ? { ...c, params: { ...c.params, [key]: value } } : c,
        ),
      );
    },
    [],
  );

  // Append generator-proposed cases to the case list. We coerce each value
  // back to a string here so the editable inputs work the same way the
  // manually-added cases do; coercion to typed JSON happens on submit.
  const appendGenerated = useCallback(
    (proposed: GeneratedCase[]) => {
      if (!adapter) return;
      setCases((cs) => {
        const drafts: CaseDraft[] = proposed.map((p, i) => {
          const params: Record<string, string> = {};
          for (const spec of adapter.case_params) {
            const v = p.params?.[spec.key];
            params[spec.key] =
              v == null ? String(spec.default ?? "") : String(v);
          }
          // Avoid duplicate case_ids by suffixing where needed.
          const existing = new Set([...cs.map((c) => c.case_id)]);
          let id = p.case_id || `gen_${String(cs.length + i + 1).padStart(3, "0")}`;
          let n = 2;
          while (existing.has(id)) {
            id = `${p.case_id}_${n++}`;
          }
          existing.add(id);
          return {
            case_id: id,
            note: p.note ?? "",
            rationale: p.rationale ?? "",
            params,
          };
        });
        return [...cs, ...drafts];
      });
    },
    [adapter],
  );

  const submit = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError("loop name is required");
      return;
    }
    if (!adapter) {
      setError("adapter is required");
      return;
    }
    if (cases.length === 0) {
      setError("add at least one case");
      return;
    }
    const built: CreateCase[] = cases.map((c) => {
      const params: Record<string, unknown> = {};
      for (const p of adapter.case_params) {
        params[p.key] = coerce(c.params[p.key] ?? "", p.type);
      }
      return {
        case_id: c.case_id,
        params,
        note: c.note,
        rationale: c.rationale,
      };
    });
    const budget = {
      compute_seconds: budgetCompute ? parseFloat(budgetCompute) : null,
      wallclock_seconds: budgetWallclock ? parseFloat(budgetWallclock) : null,
      dollars: budgetDollars ? parseFloat(budgetDollars) : null,
    };
    setSubmitting(true);
    try {
      const res = await loopCreate({
        name: name.trim(),
        adapter: adapter.id,
        cases: built,
        budget,
      });
      onCreated(res.name);
      onClose();
      // reset local state for next open
      setName("");
      setBudgetCompute("86400");
      setBudgetWallclock("");
      setBudgetDollars("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }, [
    name,
    adapter,
    cases,
    budgetCompute,
    budgetWallclock,
    budgetDollars,
    onCreated,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-carbon-4 bg-carbon-1 shadow-xl">
        <header className="flex items-center justify-between border-b border-carbon-4 px-5 py-3">
          <h2 className="font-display text-base text-ink-900">New research loop</h2>
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

          {/* Loop identity */}
          <section className="mb-5 grid grid-cols-2 gap-3">
            <Field label="Loop name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="erdos-es7-sweep"
                className="w-full rounded border border-carbon-4 bg-void px-2 py-1.5 font-mono text-xs text-text-1 focus:border-cinnabar-400 focus:outline-none"
              />
            </Field>
            <Field label="Adapter">
              <select
                value={adapterId}
                onChange={(e) => setAdapterId(e.target.value)}
                className="w-full rounded border border-carbon-4 bg-void px-2 py-1.5 text-xs text-text-1 focus:border-cinnabar-400 focus:outline-none"
              >
                {adapters.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
            {adapter?.description && (
              <p className="col-span-2 text-[11px] leading-relaxed text-text-5">
                {adapter.description}
              </p>
            )}
          </section>

          {/* Budget */}
          <section className="mb-5">
            <SectionTitle>Budget (optional)</SectionTitle>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <Field label="Compute seconds">
                <NumberInput value={budgetCompute} onChange={setBudgetCompute} />
              </Field>
              <Field label="Wall-clock seconds">
                <NumberInput value={budgetWallclock} onChange={setBudgetWallclock} />
              </Field>
              <Field label="Dollars">
                <NumberInput value={budgetDollars} onChange={setBudgetDollars} />
              </Field>
            </div>
          </section>

          {/* Cases */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle>Cases ({cases.length})</SectionTitle>
              {adapter && (
                <button
                  type="button"
                  onClick={addCase}
                  className="rounded border border-carbon-4 px-2 py-1 text-[11px] text-text-2 hover:border-cinnabar-400 hover:text-cinnabar-400"
                >
                  + add case
                </button>
              )}
            </div>

            {/* Auto-generator — appends to the cases list below */}
            <div className="mb-3">
              <CaseGeneratorPanel
                adapter={adapter}
                onProposed={appendGenerated}
              />
            </div>

            <div className="space-y-3">
              {cases.map((c, idx) => (
                <CaseCard
                  key={idx}
                  index={idx}
                  draft={c}
                  adapter={adapter}
                  onChange={(patch) => updateCase(idx, patch)}
                  onParamChange={(k, v) => updateParam(idx, k, v)}
                  onRemove={cases.length > 1 ? () => removeCase(idx) : undefined}
                />
              ))}
            </div>
          </section>
        </div>

        {/* Footer actions */}
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
            disabled={submitting || !adapter || cases.length === 0}
            onClick={submit}
            className="rounded bg-cinnabar-400 px-3 py-1.5 text-xs font-medium text-void hover:bg-cinnabar-500 disabled:opacity-40"
          >
            {submitting ? "creating…" : "Initialize loop"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---------- helpers ----------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-3">
      {children}
    </h3>
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

function NumberInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-carbon-4 bg-void px-2 py-1.5 font-mono text-xs text-text-1 focus:border-cinnabar-400 focus:outline-none"
    />
  );
}

function CaseCard({
  index,
  draft,
  adapter,
  onChange,
  onParamChange,
  onRemove,
}: {
  index: number;
  draft: CaseDraft;
  adapter: AdapterInfo | null;
  onChange: (patch: Partial<CaseDraft>) => void;
  onParamChange: (key: string, value: string) => void;
  onRemove?: () => void;
}) {
  if (!adapter) return null;
  return (
    <div className="rounded border border-carbon-4 bg-carbon-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex-1">
          <Field label={`Case ${index + 1} · id`}>
            <input
              type="text"
              value={draft.case_id}
              onChange={(e) => onChange({ case_id: e.target.value })}
              className="w-full rounded border border-carbon-4 bg-void px-2 py-1 font-mono text-[11px] text-text-1 focus:border-cinnabar-400 focus:outline-none"
            />
          </Field>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="self-end text-[11px] text-text-5 hover:text-status-failing"
          >
            remove
          </button>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        {adapter.case_params.map((p) => (
          <ParamField
            key={p.key}
            spec={p}
            value={draft.params[p.key] ?? ""}
            onChange={(v) => onParamChange(p.key, v)}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Note (optional)">
          <input
            type="text"
            value={draft.note}
            onChange={(e) => onChange({ note: e.target.value })}
            className="w-full rounded border border-carbon-4 bg-void px-2 py-1 text-[11px] text-text-1 focus:border-cinnabar-400 focus:outline-none"
          />
        </Field>
        <Field label="Rationale (optional)">
          <input
            type="text"
            value={draft.rationale}
            onChange={(e) => onChange({ rationale: e.target.value })}
            className="w-full rounded border border-carbon-4 bg-void px-2 py-1 text-[11px] text-text-1 focus:border-cinnabar-400 focus:outline-none"
          />
        </Field>
      </div>
    </div>
  );
}

function ParamField({
  spec,
  value,
  onChange,
}: {
  spec: ParamSpec;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10px] uppercase tracking-wider text-text-4">
        {spec.label}
      </span>
      {spec.type === "bool" ? (
        <select
          value={value || "false"}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-carbon-4 bg-void px-2 py-1 text-[11px] text-text-1 focus:border-cinnabar-400 focus:outline-none"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          type={spec.type === "string" ? "text" : "number"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={spec.placeholder}
          min={spec.min}
          max={spec.max}
          className="w-full rounded border border-carbon-4 bg-void px-2 py-1 font-mono text-[11px] text-text-1 focus:border-cinnabar-400 focus:outline-none"
        />
      )}
      {spec.help && (
        <span className="block text-[10px] leading-snug text-text-5">
          {spec.help}
        </span>
      )}
    </label>
  );
}
