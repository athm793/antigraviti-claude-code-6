"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfigWithStats } from "@/lib/types";
import type { Endpoint, EndpointDefinition, StepDef } from "@/lib/endpointTypes";
import { validateEndpointDefinition, type Issue } from "@/lib/engine/validate";
import { renameStepKey, suggestStepKey, tokensForStep, responseTokens } from "@/lib/engine/tokens";
import { describeCondition } from "@/lib/engine/describe";
import type { RunResult } from "@/lib/engine/execute";
import { StepCard } from "./StepCard";
import { InputSchemaEditor } from "./InputSchemaEditor";
import { TestRunPanel } from "./TestRunPanel";
import { ConfirmModal } from "../ConfirmModal";
import { Plus, Spinner, AlertTriangle, Check } from "../ui/Icon";
import { btnPrimary, btnSecondary, cardCls, errorBoxCls, hintCls } from "@/lib/ui";

/**
 * The waterfall builder.
 *
 * Owns the draft in local state and never derives it from props after mount:
 * a `router.refresh()` re-renders the server page around this island, and
 * re-seeding from props would throw away whatever was being edited.
 *
 * Every edit is local — no network, no spinners. Only Save and navigation
 * touch the wire.
 */
export function EndpointBuilder({
  endpoint,
  providers,
  initialDefinition,
}: {
  endpoint: Endpoint;
  providers: ConfigWithStats[];
  initialDefinition: EndpointDefinition;
}) {
  const router = useRouter();

  const [definition, setDefinition] = useState<EndpointDefinition>(initialDefinition);
  const [revision, setRevision] = useState(endpoint.revision);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<StepDef | null>(null);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  const steps = definition.steps ?? [];

  /** Last test outcome per step, so each card can show how it did. */
  const resultsByStep = useMemo(() => {
    const map = new Map<string, RunResult["steps"][number]>();
    for (const step of lastRun?.steps ?? []) map.set(step.key, step);
    return map;
  }, [lastRun]);

  const validation = useMemo(() => validateEndpointDefinition(definition), [definition]);
  const issues: Issue[] = validation.issues ?? [];
  const errorCount = issues.filter((i) => i.severity === "error").length;

  /** Issues that belong to a given step, so its card can show them. */
  const issuesByStep = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const issue of issues) {
      const match = issue.path.match(/^steps\[(\d+)\]/);
      if (!match) continue;
      const index = Number(match[1]);
      const list = map.get(index) ?? [];
      list.push(issue.message);
      map.set(index, list);
    }
    return map;
  }, [issues]);

  /** Warn on leaving with unsaved work. All in-app nav is a full page load. */
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const update = useCallback((next: EndpointDefinition) => {
    setDefinition(next);
    setDirty(true);
    setSaveError("");
    // Any edit makes the last test result stale, and a stale badge on a step
    // card is worse than no badge — it reads as "this still works".
    setLastRun(null);
  }, []);

  function updateStep(index: number, next: StepDef) {
    const previous = steps[index];
    // Renaming a step has to rewrite every reference to it, or later steps
    // silently start reading a name that no longer exists.
    if (previous.key !== next.key && next.key) {
      const withRenames = renameStepKey(
        { ...definition, steps: steps.map((s, i) => (i === index ? next : s)) },
        previous.key,
        next.key
      );
      update(withRenames.definition);
      return;
    }
    update({ ...definition, steps: steps.map((s, i) => (i === index ? next : s)) });
  }

  function addStep() {
    const taken = new Set(steps.map((s) => s.key));
    const provider = providers[0];
    const name = provider ? provider.name : "New step";
    const step: StepDef = {
      key: suggestStepKey(name, taken),
      name,
      config_id: provider?.id ?? "",
      group: null,
      enabled: true,
      request: {
        method: "POST",
        path: "/",
        query: [],
        headers: [],
        body_type: "none",
        body: null,
      },
      run_condition: null,
      success_condition: null,
      output_map: [],
      // Waterfall semantics by default: the first provider that answers wins.
      on_success: "stop",
      on_failure: "continue",
      timeout_ms: null,
      max_key_attempts: null,
      cost_per_call_cents: null,
    };
    update({ ...definition, steps: [...steps, step] });
    setExpanded((prev) => new Set(prev).add(step.key));
  }

  function duplicateStep(index: number) {
    const source = steps[index];
    const taken = new Set(steps.map((s) => s.key));
    const copy: StepDef = {
      ...structuredClone(source),
      key: suggestStepKey(source.key, taken),
      name: `${source.name} copy`,
    };
    update({ ...definition, steps: [...steps.slice(0, index + 1), copy, ...steps.slice(index + 1)] });
  }

  function removeStep(step: StepDef) {
    setConfirmDelete(null);
    update({ ...definition, steps: steps.filter((s) => s.key !== step.key) });
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    update({ ...definition, steps: next });
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/endpoints/${endpoint.id}/definition`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition, expected_revision: revision }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSaveError(data?.error ?? "Failed to save");
        // A conflict hands back the current revision so the message stays
        // accurate if they reload and try again.
        if (typeof data?.revision === "number") setRevision(data.revision);
        return;
      }

      const data = await res.json();
      setRevision(data.revision);
      setDirty(false);
      router.refresh();
    } catch {
      setSaveError("Network error — check your connection and try again");
    } finally {
      setSaving(false);
    }
  }

  /** Every output field any step produces — the endpoint's result shape. */
  const allOutputFields = useMemo(() => {
    const fields = new Set<string>();
    for (const step of steps) {
      for (const mapping of step.output_map ?? []) {
        if (mapping.field) fields.add(mapping.field);
      }
    }
    return [...fields];
  }, [steps]);

  if (providers.length === 0) {
    return (
      <div className={cardCls}>
        <h2 className="text-base font-semibold text-white">No providers yet</h2>
        <p className={hintCls}>
          A step calls one provider, so you need at least one before you can build a waterfall.
        </p>
        <a href="/configs/new" className={`${btnPrimary} gap-1.5 self-start`}>
          <Plus className="w-4 h-4" />
          Add a provider
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar. Status text and button widths are fixed so nothing shifts
          as the draft changes. */}
      <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-[#08080f]/95 backdrop-blur flex flex-wrap items-center gap-3 border-b border-[#1a1a28]">
        <span className="text-xs min-w-[13rem]">
          {errorCount > 0 ? (
            <span className="text-red-400 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              {errorCount} thing{errorCount === 1 ? "" : "s"} to fix
            </span>
          ) : dirty ? (
            <span className="text-amber-400">Unsaved changes</span>
          ) : (
            <span className="text-[#8b8b9e] inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              All changes saved
            </span>
          )}
        </span>

        <div className="flex-1" />

        <button type="button" onClick={addStep} className={`${btnSecondary} gap-1.5`}>
          <Plus className="w-4 h-4" />
          Add step
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty || errorCount > 0}
          title={errorCount > 0 ? "Fix the highlighted problems first" : undefined}
          className={`${btnPrimary} gap-2 min-w-[9.5rem]`}
        >
          {saving && <Spinner className="w-4 h-4" />}
          {saving ? "Saving…" : "Save waterfall"}
        </button>
      </div>

      {saveError && <p className={errorBoxCls}>{saveError}</p>}

      <InputSchemaEditor
        inputs={definition.inputs ?? []}
        onChange={(inputs) => update({ ...definition, inputs })}
      />

      {steps.length === 0 ? (
        <div className={cardCls}>
          <h2 className="text-base font-semibold text-white">No steps yet</h2>
          <p className={hintCls}>
            Add a step for each provider you want to try, in the order you want to try them.
          </p>
          <button type="button" onClick={addStep} className={`${btnPrimary} gap-1.5 self-start`}>
            <Plus className="w-4 h-4" />
            Add the first step
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {steps.map((step, index) => (
            <StepCard
              key={`${step.key}-${index}`}
              step={step}
              index={index}
              total={steps.length}
              providers={providers}
              tokens={[...tokensForStep(definition, index), ...responseTokens()]}
              siblingFields={allOutputFields}
              conditionSummary={describeCondition(definition, index)}
              expanded={expanded.has(step.key)}
              onToggleExpanded={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(step.key)) next.delete(step.key);
                  else next.add(step.key);
                  return next;
                })
              }
              onChange={(next) => updateStep(index, next)}
              onDelete={() => setConfirmDelete(step)}
              onDuplicate={() => duplicateStep(index)}
              onMove={(direction) => moveStep(index, direction)}
              issues={issuesByStep.get(index) ?? []}
              result={resultsByStep.get(step.key) ?? null}
            />
          ))}

          <button type="button" onClick={addStep} className={`${btnSecondary} gap-1.5 self-start`}>
            <Plus className="w-4 h-4" />
            Add step
          </button>
        </div>
      )}

      {steps.length > 0 && (
        <TestRunPanel
          endpointId={endpoint.id}
          definition={definition}
          blocked={errorCount > 0 ? "Fix the highlighted problems first" : ""}
          onResult={setLastRun}
        />
      )}

      {issues.filter((i) => i.severity === "warning").length > 0 && (
        <div className="bg-amber-500/[0.06] border border-amber-500/25 rounded-lg p-4 flex flex-col gap-1">
          <p className="text-amber-400 text-sm font-medium">Worth checking</p>
          {issues
            .filter((i) => i.severity === "warning")
            .map((issue, i) => (
              <p key={i} className="text-[#c8c8d8] text-xs">
                {issue.message}
              </p>
            ))}
        </div>
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        title="Delete step"
        message={
          confirmDelete
            ? `Delete "${confirmDelete.name}"? Any later step referring to it will need updating.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && removeStep(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
