"use client";

import { useState } from "react";
import type { ConfigWithStats } from "@/lib/types";
import type { StepDef, HttpMethod, BodyType } from "@/lib/endpointTypes";
import { HTTP_METHODS } from "@/lib/endpointTypes";
import type { TokenSuggestion } from "@/lib/engine/tokens";
import { Select } from "../ui/Select";
import { Toggle } from "../ui/Toggle";
import { TokenInput } from "./TokenInput";
import { ConditionEditor } from "./ConditionEditor";
import { KeyValueEditor } from "./KeyValueEditor";
import { MappingTable } from "./MappingTable";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Trash,
  AlertTriangle,
} from "../ui/Icon";
import { btnIcon, btnIconDanger, inputCls, labelCls, hintCls, textareaCls } from "@/lib/ui";

/**
 * One step: which provider to call, when to call it, what counts as an answer,
 * and what to keep from the response.
 */
export function StepCard({
  step,
  index,
  total,
  providers,
  tokens,
  siblingFields,
  conditionSummary,
  expanded,
  onToggleExpanded,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
  issues,
}: {
  step: StepDef;
  index: number;
  total: number;
  providers: ConfigWithStats[];
  tokens: TokenSuggestion[];
  siblingFields: string[];
  conditionSummary: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (step: StepDef) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  issues: string[];
}) {
  const [section, setSection] = useState<"query" | "headers" | "body">("query");

  const provider = providers.find((p) => p.id === step.config_id);
  const missingProvider = Boolean(step.config_id) && !provider;
  const hasIssues = issues.length > 0;

  function set(patch: Partial<StepDef>) {
    onChange({ ...step, ...patch });
  }

  function setRequest(patch: Partial<StepDef["request"]>) {
    onChange({ ...step, request: { ...step.request, ...patch } });
  }

  return (
    <div
      className={`bg-[#111118] border rounded-xl transition-colors ${
        hasIssues || missingProvider ? "border-red-500/30" : "border-[#2a2a38]"
      } ${step.enabled ? "" : "opacity-60"}`}
    >
      {/* Collapsed row: reads as a sentence top to bottom down the list. */}
      <div className="flex items-center gap-2 px-2 min-h-[64px]">
        <div className="flex flex-col shrink-0">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move ${step.name} earlier`}
            title="Move earlier"
            className="w-6 h-5 flex items-center justify-center text-[#8b8b9e] hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move ${step.name} later`}
            title="Move later"
            className="w-6 h-5 flex items-center justify-center text-[#8b8b9e] hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        <GripVertical className="w-4 h-4 text-[#2a2a38] shrink-0 hidden sm:block" />

        <span className="w-6 h-6 rounded-full bg-[#00C4B4]/15 text-[#00C4B4] text-xs font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex-1 min-w-0 text-left flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2"
        >
          <span
            className={`text-sm font-semibold truncate ${missingProvider ? "text-red-400" : "text-white"}`}
          >
            {missingProvider ? "Provider missing" : step.name || "Untitled step"}
          </span>
          <span className="text-[#8b8b9e] text-xs font-mono truncate">
            {step.request.method} {step.request.path}
          </span>
          <span className="text-[#8b8b9e] text-xs truncate w-full sm:w-auto">
            {step.enabled ? conditionSummary : "Disabled"}
          </span>
        </button>

        <Toggle
          checked={step.enabled}
          onChange={(v) => set({ enabled: v })}
          label={`${step.name} enabled`}
        />

        <button
          type="button"
          onClick={onDuplicate}
          aria-label={`Duplicate ${step.name}`}
          title="Duplicate step"
          className={btnIcon}
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${step.name}`}
          title="Delete step"
          className={btnIconDanger}
        >
          <Trash className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-label={expanded ? "Collapse step" : "Expand step"}
          className={btnIcon}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {hasIssues && (
        <div className="px-4 pb-3 flex flex-col gap-1">
          {issues.map((issue) => (
            <p key={issue} className="text-red-400 text-xs flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {issue}
            </p>
          ))}
        </div>
      )}

      {expanded && (
        <div className="border-t border-[#1a1a28] px-4 py-4 flex flex-col gap-6">
          {/* 1 — when */}
          {index > 0 && (
            <Section
              title="When should this step run?"
              hint="Leave empty to always run it."
            >
              <ConditionEditor
                rule={step.run_condition}
                onChange={(rule) => set({ run_condition: rule })}
                tokens={tokens}
                emptyLabel="Always runs."
              />
            </Section>
          )}

          {/* 2 — what */}
          <Section title="Request">
            <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-3">
              <div className="flex flex-col gap-1.5">
                <span className={labelCls}>Provider</span>
                <Select
                  value={step.config_id}
                  onChange={(v) => set({ config_id: v })}
                  options={providers.map((p) => ({
                    value: p.id,
                    label: p.name,
                    hint: p.target_base_url,
                    badge:
                      p.stats.active === 0 ? (
                        <span
                          title="No active keys in this provider's pool"
                          className="w-2 h-2 rounded-full bg-red-400 shrink-0"
                        />
                      ) : (
                        <span
                          title={`${p.stats.active} active keys`}
                          className="w-2 h-2 rounded-full bg-[#00C4B4] shrink-0"
                        />
                      ),
                  }))}
                  placeholder="Pick a provider"
                  ariaLabel="Provider"
                  invalid={missingProvider || !step.config_id}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className={labelCls}>Step name</span>
                <input
                  value={step.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Find email"
                  aria-label="Step name"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <div className="flex flex-col gap-1.5">
                <span className={labelCls}>Method</span>
                <Select
                  value={step.request.method}
                  onChange={(v) => setRequest({ method: v as HttpMethod })}
                  options={HTTP_METHODS.map((m) => ({ value: m, label: m }))}
                  ariaLabel="HTTP method"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={labelCls}>Path</span>
                <div className="flex items-stretch">
                  <span className="flex items-center px-3 bg-[#111118] border border-r-0 border-[#2a2a38] rounded-l-lg text-[#8b8b9e] text-xs font-mono whitespace-nowrap max-w-[45%] truncate">
                    {provider?.target_base_url ?? "provider URL"}
                  </span>
                  <TokenInput
                    value={step.request.path}
                    onChange={(v) => setRequest({ path: v })}
                    tokens={tokens}
                    placeholder="/v1/email-finder"
                    ariaLabel="Request path"
                    className="flex-1 [&>input]:rounded-l-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-1 bg-[#0a0a10] border border-[#2a2a38] rounded-lg p-1 self-start">
              {(["query", "headers", "body"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSection(tab)}
                  aria-pressed={section === tab}
                  className={`min-h-[36px] px-3 rounded text-xs capitalize transition-colors ${
                    section === tab ? "bg-[#15151f] text-white" : "text-[#8b8b9e] hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {section === "query" && (
              <KeyValueEditor
                rows={step.request.query ?? []}
                onChange={(query) => setRequest({ query })}
                tokens={tokens}
                keyPlaceholder="domain"
                valuePlaceholder="{{input.domain}}"
                addLabel="Add parameter"
                emptyLabel="No query parameters."
              />
            )}

            {section === "headers" && (
              <KeyValueEditor
                rows={step.request.headers ?? []}
                onChange={(headers) => setRequest({ headers })}
                tokens={tokens}
                keyPlaceholder="X-Custom"
                valuePlaceholder="value"
                addLabel="Add header"
                emptyLabel="No extra headers. The provider's API key header is added automatically."
              />
            )}

            {section === "body" && (
              <div className="flex flex-col gap-2">
                <Select
                  value={step.request.body_type}
                  onChange={(v) => setRequest({ body_type: v as BodyType })}
                  options={[
                    { value: "none", label: "No body" },
                    { value: "json", label: "JSON" },
                    { value: "raw", label: "Raw text" },
                  ]}
                  ariaLabel="Body type"
                  className="w-40"
                />
                {step.request.body_type === "json" && (
                  <JsonBodyEditor
                    value={step.request.body}
                    onChange={(body) => setRequest({ body })}
                  />
                )}
                {step.request.body_type === "raw" && (
                  <textarea
                    value={String(step.request.body ?? "")}
                    onChange={(e) => setRequest({ body: e.target.value })}
                    rows={4}
                    aria-label="Raw body"
                    spellCheck={false}
                    className={textareaCls}
                  />
                )}
              </div>
            )}
          </Section>

          {/* 3 — did it work */}
          <Section
            title="What counts as an answer?"
            hint="If this fails, the step is a miss and the waterfall carries on to the next one."
          >
            <ConditionEditor
              rule={step.success_condition}
              onChange={(rule) => set({ success_condition: rule })}
              tokens={tokens}
              emptyLabel="Any 2xx response with all required output fields filled."
            />
          </Section>

          {/* 4 — what to keep */}
          <Section title="Output fields">
            <MappingTable
              mappings={step.output_map ?? []}
              onChange={(output_map) => set({ output_map })}
              tokens={tokens}
              siblingFields={siblingFields}
            />
          </Section>

          {/* 5 — what next */}
          <Section title="Then what?">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className={labelCls}>If it answers</span>
                <Select
                  value={step.on_success}
                  onChange={(v) => set({ on_success: v as StepDef["on_success"] })}
                  options={[
                    { value: "stop", label: "Stop and return this result" },
                    { value: "continue", label: "Carry on to the next step" },
                  ]}
                  ariaLabel="On success"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={labelCls}>If it doesn&apos;t</span>
                <Select
                  value={step.on_failure}
                  onChange={(v) => set({ on_failure: v as StepDef["on_failure"] })}
                  options={[
                    { value: "continue", label: "Try the next step" },
                    { value: "stop", label: "Stop and return what we have" },
                    { value: "fail", label: "Fail the whole request" },
                  ]}
                  ariaLabel="On failure"
                />
              </div>
            </div>
            <p className={hintCls}>
              &ldquo;Stop and return&rdquo; on success is what makes this a waterfall. &ldquo;Carry
              on&rdquo; turns it into a chain that gathers fields from several providers.
            </p>
          </Section>

          <details className="group">
            <summary className="text-sm text-[#c8c8d8] cursor-pointer select-none min-h-[44px] flex items-center">
              Advanced
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <NumberField
                label="Timeout (ms)"
                hint="Blank uses the endpoint default"
                value={step.timeout_ms}
                onChange={(timeout_ms) => set({ timeout_ms })}
              />
              <NumberField
                label="Key retries"
                hint="How many pool keys to try if rate-limited"
                value={step.max_key_attempts}
                onChange={(max_key_attempts) => set({ max_key_attempts })}
              />
              <NumberField
                label="Cost per call (cents)"
                hint="Feeds cost-per-answer reporting"
                value={step.cost_per_call_cents}
                onChange={(cost_per_call_cents) => set({ cost_per_call_cents })}
              />
            </div>
            <div className="flex flex-col gap-1.5 pt-3 max-w-xs">
              <span className={labelCls}>Reference name</span>
              <input
                value={step.key}
                onChange={(e) => set({ key: e.target.value })}
                aria-label="Step reference name"
                spellCheck={false}
                className={`${inputCls} font-mono text-xs`}
              />
              <p className={hintCls}>
                Used by later steps as{" "}
                <code className="text-[#00C4B4]">{`{{steps.${step.key || "name"}.output.…}}`}</code>.
                Renaming updates every reference.
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {hint && <p className={hintCls}>{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <input
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        aria-label={label}
        className={inputCls}
      />
      <p className={hintCls}>{hint}</p>
    </div>
  );
}

/**
 * JSON body editor.
 *
 * Kept as text while editing so a half-typed brace doesn't destroy the
 * object, and parsed back on blur. The stored value is always an object —
 * the engine walks it rather than splicing into a string, which is what makes
 * caller input unable to inject extra fields.
 */
function JsonBodyEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState("");

  function commit() {
    try {
      const parsed = JSON.parse(text || "{}");
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("The body must be a JSON object");
        return;
      }
      setError("");
      onChange(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That isn't valid JSON");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        rows={6}
        aria-label="JSON body"
        spellCheck={false}
        className={textareaCls}
      />
      <p className={`text-xs min-h-[16px] ${error ? "text-red-400" : "text-[#8b8b9e]"}`}>
        {error || "Use {{input.field}} inside any value. Changes apply when you click away."}
      </p>
    </div>
  );
}
