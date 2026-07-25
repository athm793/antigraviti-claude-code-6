import type { EndpointDefinition, StepDef } from "../endpointTypes";
import { collectPlaceholders } from "./template";

/**
 * The set of `{{...}}` tokens a given step is allowed to use.
 *
 * Drives the builder's autocomplete and the "available data" panel. Scoped
 * per step position, because a step may only read what definitely ran before
 * it — and a sibling in the same parallel group has not.
 */

export interface TokenSuggestion {
  token: string;
  label: string;
  hint?: string;
  group: string;
}

export function tokensForStep(
  definition: EndpointDefinition,
  stepIndex: number
): TokenSuggestion[] {
  const suggestions: TokenSuggestion[] = [];
  const steps = definition.steps ?? [];
  const step = steps[stepIndex];

  for (const field of definition.inputs ?? []) {
    if (!field.name) continue;
    suggestions.push({
      token: `input.${field.name}`,
      label: field.name,
      hint: field.example ? `e.g. ${field.example}` : field.type,
      group: "Endpoint input",
    });
  }

  for (let i = 0; i < stepIndex; i++) {
    const prior = steps[i];
    if (!prior?.key) continue;
    // Same-group siblings run concurrently, so their output isn't available.
    if (step && prior.group && prior.group === step.group) continue;

    for (const mapping of prior.output_map ?? []) {
      if (!mapping.field) continue;
      suggestions.push({
        token: `steps.${prior.key}.output.${mapping.field}`,
        label: mapping.field,
        hint: `from ${prior.name}`,
        group: `Step ${i + 1} · ${prior.name}`,
      });
    }

    suggestions.push({
      token: `steps.${prior.key}.body`,
      label: "whole response",
      hint: `from ${prior.name}`,
      group: `Step ${i + 1} · ${prior.name}`,
    });
    suggestions.push({
      token: `steps.${prior.key}.status`,
      label: "status code",
      hint: `from ${prior.name}`,
      group: `Step ${i + 1} · ${prior.name}`,
    });
  }

  return suggestions;
}

/** Tokens usable inside this step's own output mapping and success rule. */
export function responseTokens(): TokenSuggestion[] {
  return [
    { token: "response.body", label: "response body", group: "This step's response" },
    { token: "response.status", label: "status code", group: "This step's response" },
  ];
}

/**
 * Rewrites every reference when a step's key changes.
 *
 * Without this, renaming a step silently breaks every template pointing at it
 * — and the breakage only shows up as an empty field at run time.
 */
export function renameStepKey(
  definition: EndpointDefinition,
  from: string,
  to: string
): { definition: EndpointDefinition; updated: number } {
  if (from === to) return { definition, updated: 0 };

  let updated = 0;
  const pattern = new RegExp(`(\\{\\{\\s*steps\\.)${escapeRegex(from)}(\\b)`, "g");

  const rewrite = (node: unknown, depth = 0): unknown => {
    if (depth > 32) return node;
    if (typeof node === "string") {
      const next = node.replace(pattern, (_m, prefix, boundary) => {
        updated++;
        return `${prefix}${to}${boundary}`;
      });
      return next;
    }
    if (Array.isArray(node)) return node.map((item) => rewrite(item, depth + 1));
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        out[key] = rewrite(value, depth + 1);
      }
      return out;
    }
    return node;
  };

  const steps = (definition.steps ?? []).map((step) => {
    const rewritten = rewrite(step) as StepDef;
    return { ...rewritten, key: step.key === from ? to : step.key };
  });

  return { definition: { ...definition, steps }, updated };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A default step key derived from a provider name, de-duplicated. */
export function suggestStepKey(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^([0-9])/, "s$1")
      .slice(0, 30) || "step";

  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

/** Reads every step reference used by a step, for the "used by" warning. */
export function stepReferences(step: StepDef): string[] {
  const refs = new Set<string>();
  for (const placeholder of collectPlaceholders(step)) {
    const match = placeholder.match(/^steps\.([a-z][a-z0-9_]*)/);
    if (match) refs.add(match[1]);
  }
  return [...refs];
}
