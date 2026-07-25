"use client";

import { useEffect, useMemo, useState } from "react";
import type { EndpointDefinition } from "@/lib/endpointTypes";
import type { RunResult, StepTrace } from "@/lib/engine/execute";
import {
  RUN_STATUS_LABELS,
  RUN_STATUS_TONES,
  STEP_STATUS_LABELS,
  STEP_STATUS_TONES,
  toneClass,
} from "@/lib/runStatus";
import { summariseTrace } from "@/lib/engine/rules";
import { Play, Spinner, AlertTriangle, ChevronDown, ChevronUp } from "../ui/Icon";
import { CodeBlock, JsonBlock } from "../ui/CodeBlock";
import {
  badgeBase,
  btnPrimary,
  cardCls,
  errorBoxCls,
  hintCls,
  inputCls,
  labelCls,
  numericCls,
} from "@/lib/ui";

/**
 * Runs the draft as it currently stands and shows what each step did.
 *
 * Tests the *unsaved* definition on purpose: needing to publish a change to
 * find out whether it works is a miserable loop, and every experiment would
 * land in the run log and skew the hit rates this whole feature exists to
 * produce. Nothing here is persisted.
 */
export function TestRunPanel({
  endpointId,
  definition,
  blocked,
  onResult,
}: {
  endpointId: string;
  definition: EndpointDefinition;
  /** Non-empty when the draft has errors — a run would just fail server-side. */
  blocked: string;
  onResult: (result: RunResult | null) => void;
}) {
  const fields = useMemo(
    () => (definition.inputs ?? []).filter((f) => f.name?.trim()),
    [definition.inputs]
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Prefill from the declared examples, without clobbering anything already
  // typed — the input schema can change while this panel is open.
  useEffect(() => {
    setValues((current) => {
      const next = { ...current };
      let changed = false;
      for (const field of fields) {
        if (next[field.name] === undefined) {
          next[field.name] = field.example ?? "";
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [fields]);

  async function run() {
    setRunning(true);
    setError("");
    try {
      const input: Record<string, string> = {};
      for (const field of fields) {
        const value = values[field.name] ?? "";
        if (value !== "") input[field.name] = value;
      }

      const res = await fetch(`/api/endpoints/${endpointId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition, input }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const details = Array.isArray(data?.details)
          ? data.details.map((d: { message: string }) => d.message).join(" · ")
          : "";
        setError([data?.error ?? "The test run failed", details].filter(Boolean).join(" — "));
        setResult(null);
        onResult(null);
        return;
      }

      setResult(data.result as RunResult);
      onResult(data.result as RunResult);
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setRunning(false);
    }
  }

  const outputEntries = Object.entries(result?.output ?? {});

  return (
    <div className={cardCls}>
      <div>
        <h2 className="text-base font-semibold text-white">Test run</h2>
        <p className={hintCls}>
          Runs this draft exactly as saved would, against your real providers. These are live
          calls, so they use real credits. Nothing is saved or logged.
        </p>
      </div>

      {fields.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {fields.map((field) => (
            <div key={field.name} className="flex flex-col gap-1.5">
              <label htmlFor={`test-${field.name}`} className={labelCls}>
                {field.name}
                {field.required && <span className="text-[#8b8b9e]"> (required)</span>}
              </label>
              <input
                id={`test-${field.name}`}
                value={values[field.name] ?? ""}
                onChange={(e) =>
                  setValues((current) => ({ ...current, [field.name]: e.target.value }))
                }
                placeholder={field.example || field.type}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className={hintCls}>
          This endpoint takes no inputs, so there is nothing to fill in.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* The tip lives on a wrapper: a disabled button swallows the mouse
            events the tooltip listens for, and the disabled state is exactly
            when the explanation is needed. */}
        <span data-tip={blocked || undefined} className="inline-flex">
          <button
            type="button"
            onClick={run}
            disabled={running || Boolean(blocked)}
            className={`${btnPrimary} gap-2 min-w-[9rem]`}
          >
            {running ? <Spinner className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {running ? "Running…" : "Run test"}
          </button>
        </span>
        {/* Fixed slot, so the result appearing can't shove the button around. */}
        <div className="min-h-[22px] flex items-center gap-2 text-xs">
          {result && (
            <>
              <span className={`${badgeBase} ${toneClass(RUN_STATUS_TONES[result.status])}`}>
                {RUN_STATUS_LABELS[result.status]}
              </span>
              <span className={`text-[#8b8b9e] ${numericCls}`}>
                {result.duration_ms} ms · {result.upstream_calls} call
                {result.upstream_calls === 1 ? "" : "s"}
              </span>
            </>
          )}
        </div>
      </div>

      {error && <p className={errorBoxCls}>{error}</p>}

      {result && (
        <div className="flex flex-col gap-4 border-t border-[#1a1a28] pt-4">
          {result.error && (
            <p className="text-red-400 text-xs flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {result.error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-white">Result</h3>
            {outputEntries.length === 0 ? (
              <p className={hintCls}>No fields were filled.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {outputEntries.map(([field, value]) => (
                      <tr key={field} className="border-b border-[#1a1a28] last:border-0">
                        {/* Narrow enough that the values sit next to their
                            names, wide enough that they still line up. */}
                        <td className="py-2 pr-4 text-[#8b8b9e] w-32 align-top font-mono text-xs">
                          {field}
                        </td>
                        <td className="py-2 text-[#c8c8d8] break-words">
                          {typeof value === "object" && value !== null
                            ? JSON.stringify(value)
                            : String(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.missing_outputs.length > 0 && (
              <p className={hintCls}>
                Still missing: {result.missing_outputs.join(", ")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-white">What each step did</h3>
            <div className="flex flex-col gap-1.5">
              {result.steps.map((step) => (
                <StepRow key={`${step.index}-${step.key}`} step={step} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              aria-expanded={showRaw}
              className="text-xs text-[#8b8b9e] hover:text-white transition-colors self-start min-h-[44px] flex items-center"
            >
              {/*
                One text node, deliberately. A flex container drops whitespace-only
                nodes between its items, so `{expr} the winning…` renders as
                "Showthe winning…".
              */}
              <span>{`${showRaw ? "Hide" : "Show"} the winning provider's raw response`}</span>
            </button>
            {showRaw && (
              <JsonBlock
                title={
                  result.resolved_by
                    ? `Raw response from ${result.resolved_by}`
                    : "Raw response"
                }
                value={result.raw}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One line per step, in run order, opening to show why it did what it did.
 *
 * The columns are fixed-width and the numbers tabular so the difference between
 * a 40 ms miss and a 4,000 ms hit reads down the column instead of having to be
 * found in reflowing text.
 *
 * The expanded half is the part that earns its place: "why was this step
 * skipped?" and "why didn't my mapping pick anything up?" are the two questions
 * anyone actually has, and both are answered by the condition trace and the
 * response next to each other.
 */
function StepRow({ step }: { step: StepTrace }) {
  const [open, setOpen] = useState(false);

  const detail =
    step.status === "skipped" || step.status === "config_missing"
      ? step.skip_reason
      : step.error
        ? (step.error.detail ?? step.error.kind)
        : Object.keys(step.output).length > 0
          ? `Filled ${Object.keys(step.output).join(", ")}`
          : step.unresolved.length > 0
            ? `Nothing at ${step.unresolved[0]}`
            : "Returned nothing to keep";

  return (
    <div className="bg-[#0a0a10] border border-[#2a2a38] rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3 min-h-[44px] text-left hover:bg-[#0d0d15] transition-colors rounded-lg"
      >
        <span className="w-5 text-xs text-[#8b8b9e] shrink-0 tabular-nums">
          {step.index + 1}
        </span>
        {/*
          The name takes the slack on mobile and a fixed track from `sm` up,
          where the detail column exists to absorb it instead. Making both
          flex-1 stretched a two-word step name across a third of the row and
          left a void before the detail.
        */}
        <span className="text-sm text-white truncate flex-1 min-w-0 sm:flex-none sm:w-44">
          {step.name}
        </span>
        <span className="text-xs text-[#8b8b9e] truncate min-w-0 flex-1 hidden sm:block">
          {detail}
        </span>
        {/* Both repeat inside the expanded panel, so mobile loses nothing. */}
        <span className={`text-xs text-[#8b8b9e] w-14 shrink-0 hidden sm:block ${numericCls}`}>
          {step.http_status ?? "—"}
        </span>
        <span className={`text-xs text-[#8b8b9e] w-20 shrink-0 hidden sm:block ${numericCls}`}>
          {step.latency_ms ? `${step.latency_ms} ms` : "—"}
        </span>
        <span
          className={`${badgeBase} ${toneClass(STEP_STATUS_TONES[step.status])} w-[7.5rem] justify-center shrink-0`}
          data-tip={detail ?? undefined}
        >
          {STEP_STATUS_LABELS[step.status]}
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#8b8b9e] shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#8b8b9e] shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-[#1a1a28] px-3 py-3 flex flex-col gap-3">
          {/* Repeated here because the row hides these columns on mobile, and
              on mobile the detail line is where they have to live. */}
          <p className={`${hintCls} sm:hidden`}>
            {detail} · {step.http_status ?? "no response"} ·{" "}
            {step.latency_ms ? `${step.latency_ms} ms` : "—"}
          </p>

          {step.request && (
            <p className="text-xs font-mono text-[#8b8b9e] break-all">
              {step.request.method} {step.request.url}
            </p>
          )}

          {step.attempts > 1 && (
            <p className={hintCls}>
              Took {step.attempts} attempts
              {step.keys_exhausted > 0 &&
                ` — ${step.keys_exhausted} key${step.keys_exhausted === 1 ? "" : "s"} hit their rate limit`}
            </p>
          )}

          {step.unresolved.length > 0 && (
            <p className="text-amber-400 text-xs">
              No value for {step.unresolved.join(", ")} — usually why a field comes back empty.
            </p>
          )}

          {step.run_condition && (
            <TracePanel title="Should it run?" lines={summariseTrace(step.run_condition)} />
          )}
          {step.success_condition && (
            <TracePanel
              title="Did it answer?"
              lines={summariseTrace(step.success_condition)}
            />
          )}

          {Object.keys(step.output).length > 0 && (
            <JsonBlock title="What this step kept" value={step.output} maxHeight="12rem" />
          )}

          {step.response_preview && (
            <CodeBlock
              title="Response"
              code={step.response_preview}
              maxHeight="16rem"
            />
          )}
        </div>
      )}
    </div>
  );
}

function TracePanel({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={labelCls}>{title}</span>
      <pre className="text-xs font-mono text-[#c8c8d8] bg-[#111118] border border-[#2a2a38] rounded-lg p-3 overflow-x-auto whitespace-pre">
        {lines.join("\n")}
      </pre>
    </div>
  );
}
