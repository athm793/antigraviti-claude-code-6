import { buildStepRequest, type BuiltRequest } from "./request";
import { applyOutputMap, mergeOutput } from "./mapping";
import { defaultSuccessRule, evaluateRule, type RuleContext } from "./rules";
import { emptyRecord } from "./paths";
import type { TemplateContext } from "./template";
import {
  DEFAULT_SETTINGS,
  type EndpointDefinition,
  type RuleTraceNode,
  type StepDef,
} from "../endpointTypes";

/**
 * The waterfall executor.
 *
 * Every side effect arrives through `deps` — the provider lookup and the actual
 * HTTP call. Nothing here opens a socket, reads the database or writes a log.
 * That is deliberate: this is the code that decides how many paid upstream
 * calls a request makes, and it needs to be provable against a fake without a
 * network or a credit. The server adapter in `src/lib/runner.ts` supplies the
 * real implementations.
 */

export type StepStatus =
  | "success"
  | "miss"
  | "skipped"
  | "error"
  | "config_missing";

export type RunStatus = "success" | "partial" | "miss" | "error";

export interface ProviderInfo {
  id: string;
  name: string;
  /** The header the key pool injects — a step may not set it itself. */
  auth_header_name: string;
}

/** What one upstream call came back with, after rotation has had its say. */
export interface ProviderCall {
  ok: boolean;
  status: number | null;
  headers: Record<string, string>;
  /** Parsed when the response was JSON, otherwise the raw text. */
  body: unknown;
  bodyText: string;
  url: string;
  attempts: number;
  keysExhausted: number;
  latencyMs: number;
  error: { kind: string; detail?: string } | null;
}

export interface CallOptions {
  timeoutMs: number;
  deadlineAt: number;
  maxAttempts: number;
}

export interface RunDeps {
  getProvider: (configId: string) => ProviderInfo | null;
  call: (
    step: StepDef,
    provider: ProviderInfo,
    request: BuiltRequest,
    options: CallOptions
  ) => Promise<ProviderCall>;
  now: () => number;
}

export interface StepTrace {
  index: number;
  key: string;
  name: string;
  group: string | null;
  config_id: string;
  config_name: string | null;
  status: StepStatus;
  /** Plain-English reason a step didn't run. Always set when skipped. */
  skip_reason: string | null;
  http_status: number | null;
  latency_ms: number;
  attempts: number;
  keys_exhausted: number;
  cost_cents: number;
  /** What this step alone mapped, before merging into the run's result. */
  output: Record<string, unknown>;
  /** Placeholders that had no value — the usual cause of a surprising miss. */
  unresolved: string[];
  run_condition: RuleTraceNode | null;
  success_condition: RuleTraceNode | null;
  error: { kind: string; detail?: string } | null;
  request: { method: string; url: string; body: string | null } | null;
  /** Only populated when the caller asked for bodies; always truncated. */
  response_preview: string | null;
}

export interface RunResult {
  status: RunStatus;
  /** The normalized fields, merged across every step that contributed. */
  output: Record<string, unknown>;
  /** The winning step's response, untouched. */
  raw: unknown;
  resolved_by: string | null;
  steps: StepTrace[];
  duration_ms: number;
  cost_cents: number;
  /** Actual HTTP requests made, including rotation retries. */
  upstream_calls: number;
  missing_outputs: string[];
  error: string | null;
}

export interface RunOptions {
  runId: string;
  definition: EndpointDefinition;
  input: Record<string, unknown>;
  deps: RunDeps;
  /** Epoch ms. Nothing new starts after this. */
  deadlineAt: number;
  /** Per-step ceiling when a step doesn't set its own. */
  defaultStepTimeoutMs?: number;
  /** Include request and response previews in the trace. Off by default (PII). */
  includeBodies?: boolean;
}

/** Never start a step with less than this left — a doomed call still costs. */
const MIN_STEP_BUDGET_MS = 1_000;

const PREVIEW_LIMIT = 2_000;

/** Same rule the condition engine uses: 0 and false are real answers. */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function preview(text: string): string {
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}…` : text;
}

function blankTrace(step: StepDef, index: number, provider: ProviderInfo | null): StepTrace {
  return {
    index,
    key: step.key,
    name: step.name,
    group: step.group ?? null,
    config_id: step.config_id,
    config_name: provider?.name ?? null,
    status: "skipped",
    skip_reason: null,
    http_status: null,
    latency_ms: 0,
    attempts: 0,
    keys_exhausted: 0,
    cost_cents: 0,
    output: {},
    unresolved: [],
    run_condition: null,
    success_condition: null,
    error: null,
    request: null,
    response_preview: null,
  };
}

/**
 * Runs an endpoint definition to completion.
 *
 * Steps sharing a `group` still execute one after another here — opt-in
 * parallel fan-out is a later phase. That is a performance difference, not a
 * behavioural one: validation already forbids a step from referencing a
 * same-group sibling, so nothing can observe the ordering.
 */
export async function runEndpoint(options: RunOptions): Promise<RunResult> {
  const { definition, deps, runId } = options;
  const started = deps.now();
  const settings = { ...DEFAULT_SETTINGS, ...(definition.settings ?? {}) };
  const requiredOutputs = settings.required_outputs ?? [];
  const defaultTimeout = options.defaultStepTimeoutMs ?? 20_000;

  const steps = (definition.steps ?? []).filter((s) => s && s.key);
  const traces: StepTrace[] = [];

  // Null-prototype throughout: these hold parsed upstream JSON, and a body with
  // a "__proto__" key must not be able to reach Object.prototype.
  let result = emptyRecord();
  const stepContext: TemplateContext["steps"] = emptyRecord() as TemplateContext["steps"];

  let resolvedBy: string | null = null;
  let raw: unknown = null;
  let upstreamCalls = 0;
  let costCents = 0;
  let fatal: string | null = null;
  let deadlineExceeded = false;
  let stoppedAt = -1;

  const baseContext = (): TemplateContext => ({
    input: options.input,
    steps: stepContext,
    result,
    run: { id: runId, started_at: new Date(started).toISOString() },
  });

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const provider = deps.getProvider(step.config_id);
    const trace = blankTrace(step, index, provider);

    if (stoppedAt >= 0) {
      trace.skip_reason = deadlineExceeded
        ? "Ran out of time"
        : `Stopped after step ${stoppedAt + 1}`;
      traces.push(trace);
      continue;
    }

    if (step.enabled === false) {
      trace.skip_reason = "Turned off";
      traces.push(trace);
      continue;
    }

    if (!provider) {
      // The definition holds a config_id with no foreign key behind it, so a
      // deleted provider surfaces here rather than as a crash.
      trace.status = "config_missing";
      trace.skip_reason = "This step's provider no longer exists";
      traces.push(trace);
      if (step.on_failure === "fail") {
        fatal = `Step "${step.name}" refers to a provider that no longer exists`;
        stoppedAt = index;
      } else if (step.on_failure === "stop") {
        stoppedAt = index;
      }
      continue;
    }

    const remaining = options.deadlineAt - deps.now();
    if (remaining < MIN_STEP_BUDGET_MS) {
      deadlineExceeded = true;
      stoppedAt = index;
      trace.skip_reason = "Ran out of time";
      traces.push(trace);
      continue;
    }

    // --- Should this step run at all? ---------------------------------
    //
    // Evaluated with no response in scope, so `output` is this step's own
    // (empty) map and `result` is what the run has gathered so far. That is
    // what makes "only ask this vendor if we still have no email" expressible.
    const runCtx: RuleContext = {
      ...baseContext(),
      status: null,
      headers: {},
      body: null,
      output: {},
      latency_ms: 0,
      error: null,
    };

    if (step.run_condition) {
      const conditionTrace = evaluateRule(step.run_condition, runCtx);
      trace.run_condition = conditionTrace;
      if (!conditionTrace.result) {
        trace.skip_reason = "Its condition wasn't met";
        traces.push(trace);
        continue;
      }
    }

    // --- Build the request --------------------------------------------
    const built = buildStepRequest(step, runCtx, provider.auth_header_name);
    if (!built.ok) {
      trace.status = "error";
      trace.error = { kind: built.error.kind, detail: built.error.detail };
      traces.push(trace);
      if (step.on_failure === "fail") {
        fatal = built.error.detail;
        stoppedAt = index;
      } else if (step.on_failure === "stop") {
        stoppedAt = index;
      }
      continue;
    }

    trace.unresolved = [...new Set(built.request.unresolved)];

    // --- Call it -------------------------------------------------------
    const timeoutMs = Math.min(
      step.timeout_ms ?? defaultTimeout,
      Math.max(MIN_STEP_BUDGET_MS, options.deadlineAt - deps.now())
    );

    const call = await deps.call(step, provider, built.request, {
      timeoutMs,
      deadlineAt: options.deadlineAt,
      maxAttempts: step.max_key_attempts ?? 3,
    });

    upstreamCalls += call.attempts;
    trace.attempts = call.attempts;
    trace.keys_exhausted = call.keysExhausted;
    trace.latency_ms = call.latencyMs;
    trace.http_status = call.status;
    trace.request = options.includeBodies
      ? {
          method: step.request.method,
          url: call.url,
          body: built.request.bodyPreview ? preview(built.request.bodyPreview) : null,
        }
      : null;

    if (!call.ok) {
      trace.status = "error";
      trace.error = call.error ?? { kind: "unknown" };
      // Only bill for a call that actually reached the provider.
      traces.push(trace);
      stepContext[step.key] = {
        status: call.status,
        headers: call.headers,
        body: call.body,
        output: {},
        ok: false,
      };
      if (step.on_failure === "fail") {
        fatal = call.error?.detail ?? "Upstream call failed";
        stoppedAt = index;
      } else if (step.on_failure === "stop") {
        stoppedAt = index;
      }
      continue;
    }

    if (step.cost_per_call_cents) costCents += step.cost_per_call_cents;
    trace.cost_cents = step.cost_per_call_cents ?? 0;
    if (options.includeBodies) trace.response_preview = preview(call.bodyText);

    // --- Map its output ------------------------------------------------
    //
    // Runs before the success condition, so a rule can say "this step counts
    // as a hit only if it produced an email".
    const responseCtx: TemplateContext = {
      ...baseContext(),
      response: { status: call.status, headers: call.headers, body: call.body },
    };
    const mapped = applyOutputMap(step.output_map ?? [], responseCtx);
    trace.output = { ...mapped.output };
    trace.unresolved = [...new Set([...trace.unresolved, ...mapped.unresolved])];

    // --- Did it resolve the request? -----------------------------------
    const successCtx: RuleContext = {
      ...responseCtx,
      status: call.status,
      headers: call.headers,
      body: call.body,
      output: mapped.output,
      latency_ms: call.latencyMs,
      error: null,
    };

    const rule = step.success_condition ?? defaultSuccessRule(requiredOutputs);
    const successTrace = evaluateRule(rule, successCtx);
    trace.success_condition = successTrace;
    trace.status = successTrace.result ? "success" : "miss";

    stepContext[step.key] = {
      status: call.status,
      headers: call.headers,
      body: call.body,
      output: mapped.output,
      ok: successTrace.result,
    };

    // A miss can still have filled a field the next provider won't return —
    // partial data is worth keeping, and mergeOutput never overwrites.
    result = mergeOutput(result, mapped.output);
    traces.push(trace);

    if (successTrace.result) {
      if (!resolvedBy) {
        resolvedBy = step.key;
        raw = call.body;
      }
      if (step.on_success === "stop") {
        stoppedAt = index;
      }
    } else if (step.on_failure === "fail") {
      fatal = `Step "${step.name}" didn't return what was required`;
      stoppedAt = index;
    } else if (step.on_failure === "stop") {
      stoppedAt = index;
    }
  }

  const missing = requiredOutputs.filter((field) => isEmptyValue(result[field]));
  const anyOutput = Object.keys(result).length > 0;

  let status: RunStatus;
  if (fatal) {
    status = "error";
  } else if (deadlineExceeded && !resolvedBy) {
    status = "error";
  } else if (resolvedBy && missing.length === 0) {
    status = "success";
  } else if (anyOutput) {
    // Something came back, but not everything that was asked for. Still a 200:
    // downstream tools treat a non-2xx as a failure and will retry or halt.
    status = "partial";
  } else {
    status = "miss";
  }

  return {
    status,
    output: { ...result },
    raw,
    resolved_by: resolvedBy,
    steps: traces,
    duration_ms: deps.now() - started,
    cost_cents: costCents,
    upstream_calls: upstreamCalls,
    missing_outputs: missing,
    error: fatal ?? (deadlineExceeded ? "Ran out of time" : null),
  };
}
