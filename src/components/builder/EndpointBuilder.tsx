"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfigWithStats } from "@/lib/types";
import {
  DEFAULT_SETTINGS,
  type Endpoint,
  type EndpointDefinition,
  type MergeMode,
  type StepDef,
} from "@/lib/endpointTypes";
import { validateEndpointDefinition, type Issue } from "@/lib/engine/validate";
import { renameStepKey, suggestStepKey, tokensForStep, responseTokens } from "@/lib/engine/tokens";
import { describeCondition } from "@/lib/engine/describe";
import type { RunResult } from "@/lib/engine/execute";
import { StepCard } from "./StepCard";
import { InputSchemaEditor } from "./InputSchemaEditor";
import { TestRunPanel } from "./TestRunPanel";
import { JsonView } from "./JsonView";
import { ParallelGroup } from "./ParallelGroup";
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
  /** A save lost the optimistic lock. Cleared by editing or by taking their version. */
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<StepDef | null>(null);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [mode, setMode] = useState<"visual" | "json">("visual");

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
    setConflict(false);
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
        // Deliberately keep the stale revision. Adopting the one the server
        // hands back would make the next click sail past the lock and quietly
        // overwrite the save that just landed, so the only ways out are to
        // take their version or to reload the page.
        if (res.status === 409) setConflict(true);
        return;
      }

      const data = await res.json();
      // Only a save that actually landed moves the revision on.
      setRevision(data.revision);
      setDirty(false);
      setConflict(false);
      router.refresh();
    } catch {
      setSaveError("Network error — check your connection and try again");
    } finally {
      setSaving(false);
    }
  }

  /**
   * The way out of a conflict.
   *
   * Pulls the version that won and starts again from it. That discards this
   * draft, which is why it is a button they press rather than something that
   * happens to them — but without it a conflict is a dead end, since the lock
   * deliberately refuses every further save from this stale revision.
   */
  async function reloadTheirVersion() {
    setReloading(true);
    try {
      const res = await fetch(`/api/endpoints/${endpoint.id}`);
      if (!res.ok) {
        setSaveError("Couldn't load their version — reload the page to see it");
        return;
      }
      const data = await res.json();
      // Without both of these the lock would be left pointing at nothing, so
      // stay in the conflict rather than guess.
      if (typeof data?.revision !== "number" || !data?.definition) {
        setSaveError("Couldn't load their version — reload the page to see it");
        return;
      }
      setDefinition(data.definition);
      setRevision(data.revision);
      setDirty(false);
      setConflict(false);
      setSaveError("");
      setLastRun(null);
      router.refresh();
    } catch {
      setSaveError("Network error — check your connection and try again");
    } finally {
      setReloading(false);
    }
  }

  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...(definition.settings ?? {}) }),
    [definition.settings]
  );

  /**
   * Steps grouped into stages, mirroring how the engine runs them.
   *
   * Stage numbers, not step numbers: a group of three is one stage, and
   * numbering its members 2, 3, 4 would say they happen in that order.
   */
  const stages = useMemo(() => {
    const out: {
      key: string;
      group: string | null;
      stageNumber: number;
      members: { step: StepDef; index: number }[];
    }[] = [];

    steps.forEach((step, index) => {
      const group = step.group ?? null;
      const previous = out[out.length - 1];
      if (group && previous && previous.group === group) {
        previous.members.push({ step, index });
        return;
      }
      out.push({
        key: `${group ?? step.key}-${index}`,
        group,
        stageNumber: out.length + 1,
        members: [{ step, index }],
      });
    });

    return out;
  }, [steps]);

  /**
   * Joins a step to the one above it, or splits it off.
   *
   * A group is stored as a shared id on consecutive steps rather than as a
   * container, so this has to keep both ends consistent — including tidying up
   * a group that just lost its second member, since a "group" of one is a
   * container with nothing to run alongside.
   */
  function setParallel(index: number, parallel: boolean) {
    if (index === 0) return;
    const next = [...steps];
    const previous = next[index - 1];

    if (parallel) {
      const groupId = previous.group ?? `g${Date.now().toString(36)}`;
      next[index - 1] = { ...previous, group: groupId };
      next[index] = { ...next[index], group: groupId };
      update({ ...definition, steps: next });
      return;
    }

    const leaving = next[index].group;
    next[index] = { ...next[index], group: null };
    if (leaving) {
      const remaining = next.filter((s) => s.group === leaving);
      if (remaining.length === 1) {
        const alone = next.findIndex((s) => s.group === leaving);
        next[alone] = { ...next[alone], group: null };
      }
    }
    update({ ...definition, steps: next });
  }

  function setGroupMode(groupId: string, mode: MergeMode) {
    update({
      ...definition,
      settings: {
        ...settings,
        group_merge: { ...(settings.group_merge ?? {}), [groupId]: mode },
      },
    });
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

        <div
          role="group"
          aria-label="Editor mode"
          className="flex gap-1 bg-[#0a0a10] border border-[#2a2a38] rounded-lg p-1"
        >
          {(["visual", "json"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={`min-h-[36px] px-3 rounded text-xs transition-colors ${
                mode === value ? "bg-[#15151f] text-white" : "text-[#8b8b9e] hover:text-white"
              }`}
            >
              {value === "json" ? "JSON" : "Visual"}
            </button>
          ))}
        </div>

        {mode === "visual" && (
          <button type="button" onClick={addStep} className={`${btnSecondary} gap-1.5`}>
            <Plus className="w-4 h-4" />
            Add step
          </button>
        )}
        {/* Tip on a wrapper — a disabled button swallows the tooltip's mouse
            events, and disabled is exactly when the reason matters. */}
        <span
          data-tip={
            errorCount > 0
              ? "Fix the highlighted problems first"
              : conflict
                ? "Someone else saved first — take their version before saving again"
                : undefined
          }
          className="inline-flex"
        >
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty || errorCount > 0 || conflict}
            className={`${btnPrimary} gap-2 min-w-[9.5rem]`}
          >
            {saving && <Spinner className="w-4 h-4" />}
            {saving ? "Saving…" : "Save waterfall"}
          </button>
        </span>
      </div>

      {saveError && (
        <div className={`${errorBoxCls} flex flex-wrap items-center justify-between gap-3`}>
          <span className="min-w-0">{saveError}</span>
          {conflict && (
            <button
              type="button"
              onClick={reloadTheirVersion}
              disabled={reloading}
              className={`${btnSecondary} gap-2 shrink-0`}
            >
              {reloading && <Spinner className="w-4 h-4" />}
              {reloading ? "Loading…" : "Reload their version"}
            </button>
          )}
        </div>
      )}
      {conflict && (
        <p className={hintCls}>
          Saving is blocked until you take their version, so this draft can&apos;t overwrite it.
          Copy anything you need out of the JSON view first — reloading replaces it.
        </p>
      )}

      {/*
        Both views stay mounted and one is hidden, rather than swapping them.
        Unmounting would collapse every expanded step and throw away the last
        test result on the visual side, and silently discard unapplied text on
        the JSON side — which is the one place in this editor where losing
        work would be invisible.
      */}
      <div className={mode === "json" ? "contents" : "hidden"}>
        <JsonView
          definition={definition}
          providers={providers}
          slug={endpoint.slug}
          onApply={update}
        />
      </div>

      <div className={mode === "json" ? "hidden" : "flex flex-col gap-4"}>
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
          {stages.map((stage) => {
            const cards = stage.members.map(({ step, index }, position) => (
              <StepCard
                key={`${step.key}-${index}`}
                step={step}
                index={index}
                total={steps.length}
                providers={providers}
                tokens={[...tokensForStep(definition, index), ...responseTokens()]}
                siblingFields={allOutputFields}
                conditionSummary={describeCondition(definition, index)}
                // Letters inside a group, numbers outside. A numbered list
                // reads as "3 runs after 2", which inside a group is false.
                badge={
                  stage.group
                    ? String.fromCharCode(65 + position)
                    : String(stage.stageNumber)
                }
                parallelWithPrevious={position > 0}
                onParallelChange={
                  index === 0 ? undefined : (on) => setParallel(index, on)
                }
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
            ));

            if (!stage.group) return <div key={stage.key}>{cards}</div>;

            return (
              <ParallelGroup
                key={stage.key}
                members={stage.members.map((m) => m.step)}
                mode={settings.group_merge?.[stage.group] ?? "first_success"}
                onModeChange={(next) => setGroupMode(stage.group!, next)}
              >
                {cards}
              </ParallelGroup>
            );
          })}

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
      </div>

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
