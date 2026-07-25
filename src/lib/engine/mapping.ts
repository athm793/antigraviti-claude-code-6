import { BLOCKED_SEGMENTS, emptyRecord } from "./paths";
import { renderTemplate, OMIT, type TemplateContext } from "./template";
import type { OutputMapping, Transform } from "../endpointTypes";

/**
 * Output mapping — turning each provider's differently-shaped response into
 * the endpoint's single normalized result.
 */

/** Pure, total functions. A transform never throws; it returns undefined. */
function applyTransform(value: unknown, transform: Transform): unknown {
  if (value === null || value === undefined) return value;

  switch (transform) {
    case "trim":
      return typeof value === "string" ? value.trim() : value;
    case "lower":
      return typeof value === "string" ? value.toLowerCase() : value;
    case "upper":
      return typeof value === "string" ? value.toUpperCase() : value;
    case "number": {
      const n = typeof value === "number" ? value : Number(String(value).trim());
      // An unparseable number becomes undefined rather than NaN — NaN would
      // serialise to null and read as "the provider returned null".
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      const text = String(value).trim().toLowerCase();
      if (["true", "1", "yes", "y"].includes(text)) return true;
      if (["false", "0", "no", "n"].includes(text)) return false;
      return undefined;
    }
    case "first":
      return Array.isArray(value) ? value[0] : value;
    case "join":
      return Array.isArray(value) ? value.filter((v) => v != null).join(", ") : value;
    case "none":
    default:
      return value;
  }
}

export interface MappingResult {
  output: Record<string, unknown>;
  unresolved: string[];
  fieldsWritten: string[];
}

/**
 * Runs a step's output map against its response.
 *
 * Deliberately runs *before* the success condition is evaluated, so a rule can
 * say "this step succeeded only if it produced an email". That means the map
 * also runs for steps that then turn out to have failed — harmless, since it's
 * pure computation, and the trace records both.
 */
export function applyOutputMap(
  mappings: OutputMapping[],
  ctx: TemplateContext
): MappingResult {
  const output = emptyRecord();
  const unresolved: string[] = [];
  const fieldsWritten: string[] = [];

  for (const mapping of mappings) {
    const field = mapping.field?.trim();
    if (!field) continue;
    // The write side matters more than the read side: assigning through
    // __proto__ would mutate Object.prototype for the whole warm instance.
    if (BLOCKED_SEGMENTS.has(field)) continue;

    const rendered = renderTemplate(mapping.from, ctx, "omit");
    unresolved.push(...rendered.unresolved);
    if (rendered.value === OMIT || rendered.value === undefined) continue;

    const transformed = applyTransform(rendered.value, mapping.transform ?? "none");
    if (transformed === undefined) continue;

    output[field] = transformed;
    fieldsWritten.push(field);
  }

  return { output, unresolved, fieldsWritten };
}

/**
 * Merges a step's output into the run's accumulated result.
 *
 * First write wins, and an empty value never overwrites a filled one. In a
 * waterfall the earlier providers are the ones you chose to ask first; a later
 * step filling gaps must not be able to blank out what an earlier one found.
 */
export function mergeOutput(
  accumulated: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...accumulated };
  for (const [field, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || value === "") continue;
    if (merged[field] !== undefined && merged[field] !== null && merged[field] !== "") continue;
    merged[field] = value;
  }
  return merged;
}

/** Collects every value per field, for a fan-out group set to "collect". */
export function collectOutput(
  accumulated: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...accumulated };
  for (const [field, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || value === "") continue;
    const existing = merged[field];
    if (Array.isArray(existing)) {
      if (!existing.some((item) => item === value)) existing.push(value);
    } else if (existing === undefined) {
      merged[field] = [value];
    } else if (existing !== value) {
      merged[field] = [existing, value];
    }
  }
  return merged;
}
