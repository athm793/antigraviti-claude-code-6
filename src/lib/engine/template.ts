import {
  BLOCKED_SEGMENTS,
  emptyRecord,
  parsePath,
  resolveSegments,
  type Resolution,
} from "./paths";

/**
 * Template resolution — `{{input.domain}}`, `{{steps.prospeo.body.email}}`.
 *
 * No eval, no `new Function`, no expression language. A placeholder names a
 * path and nothing else, which keeps the whole surface to "walk an object".
 */

/** Roots a template may read. A closed list: `env` and `process` are not here. */
export const TEMPLATE_ROOTS = ["input", "steps", "response", "run"] as const;

export interface TemplateContext {
  input: Record<string, unknown>;
  steps: Record<
    string,
    {
      status: number | null;
      headers: Record<string, string>;
      body: unknown;
      output: Record<string, unknown>;
      ok: boolean;
    }
  >;
  /** The step currently being evaluated — only set during output mapping. */
  response?: {
    status: number | null;
    headers: Record<string, string>;
    body: unknown;
  };
  run: { id: string; started_at: string };
}

/** Sentinel meaning "leave this out entirely" — distinct from null or "". */
export const OMIT = Symbol("omit");

export type MissingPolicy = "omit" | "empty" | "fail";

export interface RenderResult {
  value: unknown;
  unresolved: string[];
  failed: boolean;
}

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

/** True when the string is exactly one placeholder and nothing else. */
function solePlaceholder(template: string): string | null {
  const trimmed = template.trim();
  if (!trimmed.startsWith("{{") || !trimmed.endsWith("}}")) return null;
  const inner = trimmed.slice(2, -2);
  if (inner.includes("{{") || inner.includes("}}")) return null;
  return inner.trim();
}

function resolveExpression(ctx: TemplateContext, expression: string): Resolution {
  const segments = parsePath(expression);
  if (!segments) return { found: false };

  const root = segments[0];
  if (root.kind !== "key") return { found: false };
  if (!(TEMPLATE_ROOTS as readonly string[]).includes(root.value)) return { found: false };

  return resolveSegments(ctx as unknown as Record<string, unknown>, segments);
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/**
 * Renders one template string.
 *
 * The important rule: a template that is *exactly* one placeholder keeps the
 * resolved value's type. `{"limit": "{{input.limit}}"}` produces
 * `{"limit": 50}`, not `{"limit": "50"}` — plenty of APIs reject the string
 * form, and quietly stringifying every value would break them.
 *
 * Anything with surrounding text interpolates to a string, as you'd expect.
 */
export function renderTemplate(
  template: string,
  ctx: TemplateContext,
  onMissing: MissingPolicy = "omit"
): RenderResult {
  const unresolved: string[] = [];

  const sole = solePlaceholder(template);
  if (sole !== null) {
    const resolved = resolveExpression(ctx, sole);
    if (!resolved.found || resolved.value === undefined || resolved.value === null) {
      unresolved.push(sole);
      if (onMissing === "fail") return { value: undefined, unresolved, failed: true };
      return {
        value: onMissing === "omit" ? OMIT : "",
        unresolved,
        failed: false,
      };
    }
    return { value: resolved.value, unresolved, failed: false };
  }

  let failed = false;
  const out = template.replace(PLACEHOLDER, (_match, rawExpression: string) => {
    const expression = rawExpression.trim();
    const resolved = resolveExpression(ctx, expression);
    if (!resolved.found || resolved.value === undefined || resolved.value === null) {
      unresolved.push(expression);
      if (onMissing === "fail") failed = true;
      return "";
    }
    return stringify(resolved.value);
  });

  if (failed) return { value: undefined, unresolved, failed: true };
  return { value: out, unresolved, failed: false };
}

/** Convenience for places that always want a string. */
export function renderToString(
  template: string,
  ctx: TemplateContext,
  onMissing: MissingPolicy = "empty"
): { text: string; unresolved: string[]; failed: boolean } {
  const result = renderTemplate(template, ctx, onMissing);
  if (result.failed) return { text: "", unresolved: result.unresolved, failed: true };
  const value = result.value === OMIT ? "" : result.value;
  return { text: stringify(value), unresolved: result.unresolved, failed: false };
}

/**
 * Builds a JSON body by walking the stored object.
 *
 * Never string-splices into a JSON template. The first company name
 * containing a double quote would break the document, and a caller could use
 * that to inject arbitrary fields into an authenticated upstream request.
 * Here every resolved value is placed as a value node and `JSON.stringify`
 * does the escaping, exactly once, at the end.
 */
export function applyTemplateToJson(
  node: unknown,
  ctx: TemplateContext,
  unresolved: string[],
  depth = 0
): unknown {
  if (depth > 32) return node;

  if (typeof node === "string") {
    const result = renderTemplate(node, ctx, "omit");
    unresolved.push(...result.unresolved);
    return result.value;
  }

  if (Array.isArray(node)) {
    return node
      .map((item) => applyTemplateToJson(item, ctx, unresolved, depth + 1))
      .filter((item) => item !== OMIT);
  }

  if (node && typeof node === "object") {
    const out = emptyRecord();
    for (const [rawKey, rawValue] of Object.entries(node as Record<string, unknown>)) {
      if (BLOCKED_SEGMENTS.has(rawKey)) continue;

      // Keys are templatable too, but a key that resolves to nothing drops the
      // whole pair rather than producing an empty-string key.
      const keyResult = renderToString(rawKey, ctx, "empty");
      unresolved.push(...keyResult.unresolved);
      const key = keyResult.text;
      if (!key) continue;

      const value = applyTemplateToJson(rawValue, ctx, unresolved, depth + 1);
      if (value === OMIT) continue;
      out[key] = value;
    }
    return out;
  }

  return node;
}

/** Every placeholder in a string, for validation and autocomplete. */
export function extractPlaceholders(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const expression = match[1].trim();
    if (expression) found.push(expression);
  }
  return found;
}

/** Walks any part of a step definition and collects every placeholder in it. */
export function collectPlaceholders(node: unknown, acc: string[] = [], depth = 0): string[] {
  if (depth > 32) return acc;
  if (typeof node === "string") {
    acc.push(...extractPlaceholders(node));
  } else if (Array.isArray(node)) {
    for (const item of node) collectPlaceholders(item, acc, depth + 1);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      acc.push(...extractPlaceholders(key));
      collectPlaceholders(value, acc, depth + 1);
    }
  }
  return acc;
}
