/**
 * Types for the aggregator layer.
 *
 * An **endpoint** is one public URL that runs an ordered list of **steps**.
 * Each step calls a different provider (a `proxy_config`, which supplies the
 * base URL, auth header and key pool) and decides, via rules, whether it
 * should run at all and whether it resolved the request.
 *
 * The whole definition is stored as one JSONB blob on an immutable version
 * row rather than as a table of steps. The Neon HTTP driver has no
 * interactive transactions, so a multi-row save can't be atomic — and a
 * half-saved waterfall doesn't just look wrong, it runs and spends money.
 */

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/**
 * Operators available in a rule.
 *
 * Deliberately no regex. V8 has no regex timeout, and the string being tested
 * comes from an upstream response — a catastrophically backtracking pattern
 * would hang the function. The rest cover the real cases.
 */
export const OPERATORS = [
  { value: "exists", label: "exists", unary: true },
  { value: "not_exists", label: "does not exist", unary: true },
  { value: "empty", label: "is empty", unary: true },
  { value: "not_empty", label: "is not empty", unary: true },
  { value: "is_true", label: "is true", unary: true },
  { value: "is_false", label: "is false", unary: true },
  { value: "eq", label: "equals", unary: false },
  { value: "neq", label: "does not equal", unary: false },
  { value: "gt", label: "is greater than", unary: false },
  { value: "gte", label: "is at least", unary: false },
  { value: "lt", label: "is less than", unary: false },
  { value: "lte", label: "is at most", unary: false },
  { value: "contains", label: "contains", unary: false },
  { value: "not_contains", label: "does not contain", unary: false },
  { value: "starts_with", label: "starts with", unary: false },
  { value: "ends_with", label: "ends with", unary: false },
  { value: "in", label: "is one of", unary: false },
  { value: "not_in", label: "is not one of", unary: false },
] as const;

export type Operator = (typeof OPERATORS)[number]["value"];

export const UNARY_OPERATORS = new Set<Operator>(
  OPERATORS.filter((o) => o.unary).map((o) => o.value)
);

export interface RuleLeaf {
  path: string;
  op: Operator;
  value?: unknown;
}

export type Rule =
  | { all: Rule[] }
  | { any: Rule[] }
  | { not: Rule }
  | RuleLeaf;

export interface RuleTraceNode {
  kind: "all" | "any" | "not" | "leaf";
  result: boolean;
  path?: string;
  op?: Operator;
  expected?: unknown;
  actual?: unknown;
  found?: boolean;
  children?: RuleTraceNode[];
}

// ---------------------------------------------------------------------------
// Output mapping
// ---------------------------------------------------------------------------

/** Pure, named transforms applied after a value is pulled from a response. */
export const TRANSFORMS = [
  { value: "none", label: "None" },
  { value: "trim", label: "Trim whitespace" },
  { value: "lower", label: "Lowercase" },
  { value: "upper", label: "Uppercase" },
  { value: "number", label: "Parse number" },
  { value: "boolean", label: "Parse true/false" },
  { value: "first", label: "First of list" },
  { value: "join", label: "Join list with commas" },
] as const;

export type Transform = (typeof TRANSFORMS)[number]["value"];

export interface OutputMapping {
  /** Name of the normalized output field this writes into. */
  field: string;
  /** Template, e.g. "{{response.body.data.email}}". */
  from: string;
  transform: Transform;
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const INPUT_TYPES = ["string", "number", "boolean", "object", "array"] as const;
export type InputType = (typeof INPUT_TYPES)[number];

export interface InputField {
  name: string;
  type: InputType;
  required: boolean;
  /** Prefills the test runner and the generated cURL sample. */
  example?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type BodyType = "none" | "json" | "raw";

/** What a group does with the results of its members. */
export const MERGE_MODES = [
  { value: "first_success", label: "First hit (in listed order)" },
  { value: "fill_empty", label: "Merge — each fills what's still missing" },
  { value: "collect", label: "Collect all results into lists" },
] as const;

export type MergeMode = (typeof MERGE_MODES)[number]["value"];

export interface StepRequest {
  method: HttpMethod;
  /** Template appended to the provider's base URL. */
  path: string;
  query: { key: string; value: string }[];
  headers: { key: string; value: string }[];
  body_type: BodyType;
  /** Object for json (walked, never string-spliced), string for raw. */
  body: unknown;
}

export interface StepDef {
  /**
   * Stable slug used in templates: {{steps.prospeo.output.email}}.
   * Never an index — reordering must not break references.
   */
  key: string;
  name: string;
  /** proxy_configs.id. Supplies base URL, auth header and key pool. */
  config_id: string;
  /** Consecutive steps sharing a non-null group run in parallel. */
  group: string | null;
  enabled: boolean;

  request: StepRequest;

  /** Skip the step entirely unless this passes. null = always run. */
  run_condition: Rule | null;
  /** Did this step resolve the request? null = 2xx + all required outputs present. */
  success_condition: Rule | null;

  output_map: OutputMapping[];

  /** "stop" makes it a waterfall; "continue" makes it a chain. */
  on_success: "stop" | "continue";
  on_failure: "continue" | "stop" | "fail";

  timeout_ms: number | null;
  max_key_attempts: number | null;
  /** Feeds cost-per-resolution analytics. */
  cost_per_call_cents: number | null;
}

export interface EndpointSettings {
  /** Output fields that must be non-empty for the default success rule. */
  required_outputs: string[];
  /** Which inputs participate in the cache key. null = all of them. */
  cache_key_fields: string[] | null;
  cache_key_exclude: string[];
  /** Lowercase + trim string inputs before hashing. */
  cache_key_normalize: boolean;
  /** Merge behaviour for parallel groups, keyed by group id. */
  group_merge: Record<string, MergeMode>;
  /** Concurrency cap inside a parallel group. */
  max_parallel: number;
}

export interface EndpointDefinition {
  version: 1;
  inputs: InputField[];
  steps: StepDef[];
  /** Declared shape of the normalized result. */
  outputs: { field: string; description?: string }[];
  settings: EndpointSettings;
  /**
   * Keys from a newer build are preserved rather than stripped, so an older
   * deploy round-tripping a definition can't silently destroy them.
   */
  _extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface Endpoint {
  id: string;
  name: string;
  slug: string;
  description: string;
  owner_user_id: string | null;
  active_version_id: string | null;
  /** Optimistic lock — a save with a stale value is rejected. */
  revision: number;
  enabled: boolean;
  cache_enabled: boolean;
  cache_ttl_seconds: number;
  run_deadline_ms: number;
  log_retention_days: number;
  /** Store request/response previews in the run log. Off by default (PII). */
  log_bodies: boolean;
  created_at: string;
  updated_at: string;
}

export interface EndpointVersion {
  id: string;
  endpoint_id: string;
  version_no: number;
  definition: EndpointDefinition;
  note: string | null;
  created_at: string;
}

export interface EndpointWithStats extends Endpoint {
  step_count: number;
  runs_7d: number;
  hits_7d: number;
  hit_rate_7d: number | null;
  has_key: boolean;
}

/** A newly minted key. The plaintext exists only in this object, once. */
export interface EndpointKeyIssued {
  id: string;
  key_id: string;
  /** Shown once at creation and never retrievable again. */
  plaintext: string;
  created_at: string;
}

export interface EndpointKeyRecord {
  id: string;
  endpoint_id: string;
  key_id: string;
  label: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export const DEFAULT_SETTINGS: EndpointSettings = {
  required_outputs: [],
  cache_key_fields: null,
  cache_key_exclude: [],
  cache_key_normalize: true,
  group_merge: {},
  max_parallel: 5,
};

export function emptyDefinition(): EndpointDefinition {
  return {
    version: 1,
    inputs: [],
    steps: [],
    outputs: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
