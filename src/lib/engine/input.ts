import { emptyRecord } from "./paths";
import type { InputField } from "../endpointTypes";

/**
 * Checking what a caller sent against the endpoint's declared inputs.
 *
 * Strict enough to catch the mistake that actually happens — a missing or
 * misspelled field, which would otherwise sail through and produce a run that
 * calls three paid providers with an empty domain and returns nothing.
 */

export interface InputValidation {
  ok: boolean;
  value: Record<string, unknown>;
  errors: { field: string; message: string }[];
  /** Sent but not declared. Kept, but worth surfacing — usually a typo. */
  unknown: string[];
}

/** Values a caller might reasonably send for a declared type. */
function coerce(
  value: unknown,
  type: InputField["type"]
): { ok: true; value: unknown } | { ok: false; expected: string } {
  switch (type) {
    case "string":
      if (typeof value === "string") return { ok: true, value };
      if (typeof value === "number" || typeof value === "boolean") {
        return { ok: true, value: String(value) };
      }
      return { ok: false, expected: "text" };

    case "number": {
      if (typeof value === "number") {
        return Number.isFinite(value) ? { ok: true, value } : { ok: false, expected: "a number" };
      }
      // Form posts and spreadsheets send numbers as text constantly.
      if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        if (Number.isFinite(n)) return { ok: true, value: n };
      }
      return { ok: false, expected: "a number" };
    }

    case "boolean": {
      if (typeof value === "boolean") return { ok: true, value };
      const text = String(value).trim().toLowerCase();
      if (["true", "1", "yes"].includes(text)) return { ok: true, value: true };
      if (["false", "0", "no"].includes(text)) return { ok: true, value: false };
      return { ok: false, expected: "true or false" };
    }

    case "array":
      return Array.isArray(value) ? { ok: true, value } : { ok: false, expected: "a list" };

    case "object":
      return value && typeof value === "object" && !Array.isArray(value)
        ? { ok: true, value }
        : { ok: false, expected: "an object" };

    default:
      return { ok: true, value };
  }
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

export function validateRunInput(
  fields: InputField[],
  payload: unknown
): InputValidation {
  const errors: InputValidation["errors"] = [];
  // Null prototype: these keys come straight off the wire and are later walked
  // by the template resolver.
  const value = emptyRecord();

  if (payload !== undefined && payload !== null && typeof payload !== "object") {
    return {
      ok: false,
      value,
      errors: [{ field: "", message: "Send a JSON object of input fields" }],
      unknown: [],
    };
  }
  if (Array.isArray(payload)) {
    return {
      ok: false,
      value,
      errors: [
        {
          field: "",
          // Its own message: a caller batching rows will hit exactly this, and
          // "send a JSON object" wouldn't tell them what they did wrong.
          message: "Send one object, not a list — this endpoint runs one input at a time",
        },
      ],
      unknown: [],
    };
  }

  const sent = (payload ?? {}) as Record<string, unknown>;
  const declared = new Set<string>();

  for (const field of fields ?? []) {
    const name = field?.name?.trim();
    if (!name) continue;
    declared.add(name);

    const raw = Object.prototype.hasOwnProperty.call(sent, name) ? sent[name] : undefined;

    if (isBlank(raw)) {
      if (field.required) {
        errors.push({ field: name, message: `"${name}" is required` });
      }
      continue;
    }

    const coerced = coerce(raw, field.type);
    if (!coerced.ok) {
      errors.push({ field: name, message: `"${name}" must be ${coerced.expected}` });
      continue;
    }
    value[name] = coerced.value;
  }

  const unknown = Object.keys(sent).filter((key) => !declared.has(key));

  return { ok: errors.length === 0, value, errors, unknown };
}
