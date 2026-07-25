import { resolvePath, type Resolution } from "./paths";
import {
  UNARY_OPERATORS,
  type Operator,
  type Rule,
  type RuleLeaf,
  type RuleTraceNode,
} from "../endpointTypes";
import type { TemplateContext } from "./template";

/**
 * Condition evaluation.
 *
 * Rules decide two things per step: should it run at all, and did it resolve
 * the request. Both are JSON trees rather than expressions, so they can be
 * edited in a UI, validated at save time, and can't execute anything.
 */

export interface RuleContext extends TemplateContext {
  /** This step's response. Absent when evaluating a run-condition. */
  status: number | null;
  headers: Record<string, string>;
  body: unknown;
  /** Fields this step mapped, available before success is decided. */
  output: Record<string, unknown>;
  latency_ms: number;
  error: string | null;
}

const MAX_RULE_DEPTH = 10;

function isLeaf(rule: Rule): rule is RuleLeaf {
  return typeof (rule as RuleLeaf).path === "string";
}

/** Header lookups are case-insensitive, since header casing is not meaningful. */
function resolveIn(ctx: RuleContext, path: string): Resolution {
  if (path === "headers" || path.startsWith("headers.")) {
    const name = path.slice("headers.".length).toLowerCase();
    if (!name) return { found: true, value: ctx.headers };
    return Object.prototype.hasOwnProperty.call(ctx.headers, name)
      ? { found: true, value: ctx.headers[name] }
      : { found: false };
  }
  return resolvePath(ctx as unknown as Record<string, unknown>, path);
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  return NaN;
}

/** Stable stringify so object comparison doesn't depend on key order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  const bothPrimitive =
    (a === null || typeof a !== "object") && (b === null || typeof b !== "object");

  if (bothPrimitive) {
    // "200" and 200 should match: upstreams are inconsistent about types and a
    // rule author shouldn't have to know which one this API picked today.
    const na = asNumber(a);
    const nb = asNumber(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;

    if (typeof a === "boolean" || typeof b === "boolean") {
      return String(a).toLowerCase() === String(b).toLowerCase();
    }

    return String(a) === String(b);
  }

  return canonical(a) === canonical(b);
}

/**
 * "Empty" means missing, null, "", [] or {}.
 *
 * Note that `0` and `false` are NOT empty — a confidence score of 0 and a
 * "verified: false" flag are real answers, and treating them as missing would
 * make a waterfall fall through on a provider that actually replied.
 */
function isEmpty(resolution: Resolution): boolean {
  if (!resolution.found) return true;
  const value = resolution.value;
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function truthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["true", "1", "yes", "y"].includes(value.trim().toLowerCase());
  }
  return false;
}

function evaluateLeaf(leaf: RuleLeaf, ctx: RuleContext): RuleTraceNode {
  const resolution = resolveIn(ctx, leaf.path);
  const actual = resolution.found ? resolution.value : undefined;

  const node: RuleTraceNode = {
    kind: "leaf",
    result: false,
    path: leaf.path,
    op: leaf.op,
    found: resolution.found,
    actual: previewValue(actual),
  };
  if (!UNARY_OPERATORS.has(leaf.op)) node.expected = leaf.value;

  node.result = applyOperator(leaf.op, resolution, leaf.value);
  return node;
}

function applyOperator(op: Operator, resolution: Resolution, expected: unknown): boolean {
  const found = resolution.found;
  const actual = found ? resolution.value : undefined;

  switch (op) {
    case "exists":
      return found && actual !== null && actual !== undefined;
    case "not_exists":
      return !found || actual === null || actual === undefined;
    case "empty":
      return isEmpty(resolution);
    case "not_empty":
      return !isEmpty(resolution);
    case "is_true":
      return found && truthy(actual);
    case "is_false":
      return found && !truthy(actual);
    case "eq":
      return found && looseEquals(actual, expected);
    case "neq":
      return !found || !looseEquals(actual, expected);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = asNumber(actual);
      const b = asNumber(expected);
      // A non-numeric comparison is false rather than an error — a provider
      // returning "n/a" where a number was expected shouldn't kill the run.
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      if (op === "gt") return a > b;
      if (op === "gte") return a >= b;
      if (op === "lt") return a < b;
      return a <= b;
    }
    case "contains":
    case "not_contains": {
      const hit = containsValue(actual, expected);
      return op === "contains" ? hit : !hit;
    }
    case "starts_with":
      return found && String(actual).startsWith(String(expected));
    case "ends_with":
      return found && String(actual).endsWith(String(expected));
    case "in":
    case "not_in": {
      const list = Array.isArray(expected) ? expected : [];
      const hit = found && list.some((candidate) => looseEquals(actual, candidate));
      return op === "in" ? hit : !hit;
    }
    default:
      return false;
  }
}

function containsValue(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string") return actual.includes(String(expected));
  if (Array.isArray(actual)) return actual.some((item) => looseEquals(item, expected));
  if (actual && typeof actual === "object") {
    return Object.prototype.hasOwnProperty.call(actual, String(expected));
  }
  return false;
}

/** Trimmed so a trace row can't carry a whole response body. */
function previewValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  }
  if (value === null || typeof value !== "object") return value;
  try {
    const text = JSON.stringify(value) ?? "";
    return text.length > 200 ? `${text.slice(0, 200)}…` : JSON.parse(text);
  } catch {
    return "[unserialisable]";
  }
}

/**
 * Evaluates a rule and returns a trace, not just a boolean.
 *
 * The trace is what lets the UI answer "why was this step skipped?", which is
 * the single most-asked question about any conditional workflow. Children are
 * evaluated even once the result is decided — short-circuiting would leave
 * holes in the explanation, and these are pure, microsecond-scale checks.
 */
export function evaluateRule(
  rule: Rule,
  ctx: RuleContext,
  depth = 0
): RuleTraceNode {
  if (depth > MAX_RULE_DEPTH) {
    return { kind: "leaf", result: false, path: "(too deeply nested)" };
  }

  if (isLeaf(rule)) return evaluateLeaf(rule, ctx);

  if ("all" in rule) {
    const children = rule.all.map((child) => evaluateRule(child, ctx, depth + 1));
    // An empty "all" is vacuously true, matching how "no conditions" reads.
    return { kind: "all", result: children.every((c) => c.result), children };
  }

  if ("any" in rule) {
    const children = rule.any.map((child) => evaluateRule(child, ctx, depth + 1));
    return { kind: "any", result: children.some((c) => c.result), children };
  }

  const child = evaluateRule(rule.not, ctx, depth + 1);
  return { kind: "not", result: !child.result, children: [child] };
}

/**
 * The rule used when a step doesn't define its own success condition:
 * a 2xx response, plus every required output field actually filled.
 *
 * That second half is the whole point of the feature. A provider returning
 * HTTP 200 with `{"email": null}` has not resolved anything, and without this
 * the waterfall would stop on it and return nothing.
 */
export function defaultSuccessRule(requiredOutputs: string[]): Rule {
  return {
    all: [
      { path: "status", op: "gte", value: 200 },
      { path: "status", op: "lt", value: 300 },
      ...requiredOutputs.map((field) => ({
        path: `output.${field}`,
        op: "not_empty" as Operator,
      })),
    ],
  };
}

/** Flattens a trace into short lines for a log or a tooltip. */
export function summariseTrace(node: RuleTraceNode, indent = 0): string[] {
  const pad = "  ".repeat(indent);
  if (node.kind === "leaf") {
    const expected = node.expected === undefined ? "" : ` ${JSON.stringify(node.expected)}`;
    return [`${pad}${node.result ? "✓" : "✗"} ${node.path} ${node.op}${expected}`];
  }
  const header = `${pad}${node.result ? "✓" : "✗"} ${node.kind}`;
  const children = (node.children ?? []).flatMap((c) => summariseTrace(c, indent + 1));
  return [header, ...children];
}
