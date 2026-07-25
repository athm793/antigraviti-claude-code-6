import { collectPlaceholders, TEMPLATE_ROOTS } from "./template";
import { parsePath, BLOCKED_SEGMENTS } from "./paths";
import {
  DEFAULT_SETTINGS,
  HTTP_METHODS,
  OPERATORS,
  TRANSFORMS,
  UNARY_OPERATORS,
  type EndpointDefinition,
  type Rule,
  type RuleLeaf,
  type StepDef,
} from "../endpointTypes";

/**
 * One validator, used by the builder UI, the JSON editor and the write route.
 *
 * Sharing it is the point: if the UI and the server disagree about what's
 * valid, you get definitions that save but won't run, or edits the UI refuses
 * that the API would have accepted.
 */

export interface Issue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export type ValidationResult =
  | { ok: true; value: EndpointDefinition; issues: Issue[] }
  | { ok: false; issues: Issue[] };

/** Caps that keep one inbound request from fanning out without bound. */
export const LIMITS = {
  maxSteps: 12,
  maxQueryParams: 30,
  maxHeaders: 30,
  maxOutputMappings: 40,
  maxRuleNodes: 200,
  maxInputs: 30,
  maxParallel: 8,
  maxStepTimeoutMs: 45_000,
  maxKeyAttemptsPerStep: 5,
};

const VALID_OPERATORS = new Set(OPERATORS.map((o) => o.value));
const VALID_TRANSFORMS = new Set(TRANSFORMS.map((t) => t.value));
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

function error(path: string, message: string): Issue {
  return { path, message, severity: "error" };
}

function warn(path: string, message: string): Issue {
  return { path, message, severity: "warning" };
}

function countRuleNodes(rule: Rule, depth = 0): number {
  if (depth > 20) return LIMITS.maxRuleNodes + 1;
  if ("all" in rule) return 1 + rule.all.reduce((n, r) => n + countRuleNodes(r, depth + 1), 0);
  if ("any" in rule) return 1 + rule.any.reduce((n, r) => n + countRuleNodes(r, depth + 1), 0);
  if ("not" in rule) return 1 + countRuleNodes(rule.not, depth + 1);
  return 1;
}

function validateRule(rule: unknown, path: string, issues: Issue[]): void {
  if (!rule || typeof rule !== "object") {
    issues.push(error(path, "A condition must be an object"));
    return;
  }

  const node = rule as Record<string, unknown>;

  if (Array.isArray(node.all) || Array.isArray(node.any)) {
    const key = Array.isArray(node.all) ? "all" : "any";
    const children = node[key] as unknown[];
    children.forEach((child, i) => validateRule(child, `${path}.${key}[${i}]`, issues));
    return;
  }

  if (node.not !== undefined) {
    validateRule(node.not, `${path}.not`, issues);
    return;
  }

  const leaf = node as unknown as RuleLeaf;
  if (typeof leaf.path !== "string" || !leaf.path.trim()) {
    issues.push(error(path, "This condition is missing the field it should check"));
    return;
  }
  if (!parsePath(leaf.path)) {
    issues.push(error(`${path}.path`, `"${leaf.path}" isn't a valid field path`));
  }
  if (!VALID_OPERATORS.has(leaf.op)) {
    issues.push(error(`${path}.op`, `"${String(leaf.op)}" isn't a valid comparison`));
    return;
  }
  if (!UNARY_OPERATORS.has(leaf.op) && leaf.value === undefined) {
    issues.push(error(`${path}.value`, `"${leaf.op}" needs a value to compare against`));
  }
  if ((leaf.op === "in" || leaf.op === "not_in") && !Array.isArray(leaf.value)) {
    issues.push(error(`${path}.value`, `"${leaf.op}" needs a list of values`));
  }
}

/** Walks a rule tree and rejects any leaf reading this step's own response. */
function rejectResponsePaths(rule: unknown, path: string, issues: Issue[]): void {
  if (!rule || typeof rule !== "object") return;
  const node = rule as Record<string, unknown>;

  if (Array.isArray(node.all) || Array.isArray(node.any)) {
    const key = Array.isArray(node.all) ? "all" : "any";
    (node[key] as unknown[]).forEach((child, i) =>
      rejectResponsePaths(child, `${path}.${key}[${i}]`, issues)
    );
    return;
  }
  if (node.not !== undefined) {
    rejectResponsePaths(node.not, `${path}.not`, issues);
    return;
  }

  const leaf = node as unknown as RuleLeaf;
  if (typeof leaf.path !== "string") return;
  const segments = parsePath(leaf.path);
  const root = segments?.[0];
  if (root?.kind === "key" && root.value === "response") {
    issues.push(
      error(
        `${path}.path`,
        `"${leaf.path}" can't be used here — a run condition is checked before the call, so this step has no response yet`
      )
    );
  }
}

/**
 * Checks every `{{...}}` in a step.
 *
 * The forward-reference rule is what makes reordering safe: a step can only
 * read steps that definitely ran before it. Without it you get a waterfall
 * that works in testing and silently produces empty fields in production,
 * depending on order.
 */
function validateStepTemplates(
  step: StepDef,
  index: number,
  steps: StepDef[],
  inputNames: Set<string>,
  issues: Issue[]
): void {
  const priorKeys = new Set<string>();
  for (let i = 0; i < index; i++) {
    // A sibling in the same parallel group has not necessarily finished, so it
    // is not a valid reference even though it appears earlier in the list.
    if (steps[i].group && steps[i].group === step.group) continue;
    priorKeys.add(steps[i].key);
  }

  /*
   * Collected in two groups so `response.*` can be scoped.
   *
   * `response` is this step's own reply, which does not exist yet while the
   * request is being built or the run condition evaluated — it is only
   * meaningful in output_map.from and the success condition. Previously any
   * placeholder root in TEMPLATE_ROOTS passed anywhere, so a
   * `{{response.body.x}}` in a query parameter saved cleanly and then silently
   * resolved to nothing at run time, which is the single hardest kind of
   * definition bug to diagnose from the outside.
   */
  const preResponse = collectPlaceholders({
    request: step.request,
    run_condition: step.run_condition,
  });
  const postResponse = collectPlaceholders({
    success_condition: step.success_condition,
    output_map: step.output_map,
  });
  const placeholders = [...preResponse, ...postResponse];
  const responseAllowed = new Set(postResponse);

  const base = `steps[${index}]`;

  for (const placeholder of placeholders) {
    const segments = parsePath(placeholder);
    if (!segments) {
      issues.push(error(base, `"{{${placeholder}}}" isn't a valid reference`));
      continue;
    }

    const root = segments[0];
    if (root.kind !== "key" || !(TEMPLATE_ROOTS as readonly string[]).includes(root.value)) {
      issues.push(
        error(
          base,
          `"{{${placeholder}}}" starts with something unknown — use input, steps, response or run`
        )
      );
      continue;
    }

    if (root.value === "response" && !responseAllowed.has(placeholder)) {
      issues.push(
        error(
          base,
          `"{{${placeholder}}}" can only be used in an output field or a success condition — this step's response doesn't exist yet when the request is built`
        )
      );
      continue;
    }

    if (root.value === "input") {
      const name = segments[1];
      if (name?.kind === "key" && inputNames.size > 0 && !inputNames.has(name.value)) {
        issues.push(
          warn(base, `"{{${placeholder}}}" refers to an input "${name.value}" that isn't declared`)
        );
      }
      continue;
    }

    if (root.value === "steps") {
      const referenced = segments[1];
      if (referenced?.kind !== "key") {
        issues.push(error(base, `"{{${placeholder}}}" doesn't name a step`));
        continue;
      }
      const name = referenced.value;

      if (name === step.key) {
        issues.push(error(base, `Step "${step.key}" can't refer to its own output — use "response" instead`));
        continue;
      }
      if (!steps.some((s) => s.key === name)) {
        issues.push(error(base, `"{{${placeholder}}}" refers to a step "${name}" that doesn't exist`));
        continue;
      }
      if (!priorKeys.has(name)) {
        const sibling = steps.find((s) => s.key === name);
        issues.push(
          error(
            base,
            sibling && sibling.group && sibling.group === step.group
              ? `"${step.key}" can't use "${name}" — they run at the same time, so "${name}" may not have finished`
              : `"${step.key}" can't use "${name}" — that step runs later`
          )
        );
      }
    }
  }
}

function validateStep(
  step: unknown,
  index: number,
  allSteps: StepDef[],
  inputNames: Set<string>,
  seenKeys: Set<string>,
  issues: Issue[]
): void {
  const base = `steps[${index}]`;
  if (!step || typeof step !== "object") {
    issues.push(error(base, "Step must be an object"));
    return;
  }

  const s = step as StepDef;

  if (!s.key || !KEY_PATTERN.test(s.key)) {
    issues.push(
      error(
        `${base}.key`,
        "Step reference must start with a letter and use only lowercase letters, numbers and underscores"
      )
    );
  } else if (seenKeys.has(s.key)) {
    issues.push(error(`${base}.key`, `Two steps both use the reference "${s.key}"`));
  } else {
    seenKeys.add(s.key);
  }

  if (!s.name?.trim()) issues.push(error(`${base}.name`, "Give the step a name"));
  if (!s.config_id) issues.push(error(`${base}.config_id`, "Pick a provider for this step"));

  if (!s.request || typeof s.request !== "object") {
    issues.push(error(`${base}.request`, "Step is missing its request settings"));
    return;
  }

  if (!(HTTP_METHODS as readonly string[]).includes(s.request.method)) {
    issues.push(error(`${base}.request.method`, `"${s.request.method}" isn't a supported method`));
  }
  if (typeof s.request.path !== "string" || !s.request.path.startsWith("/")) {
    issues.push(error(`${base}.request.path`, "Path must start with /"));
  }
  if ((s.request.query?.length ?? 0) > LIMITS.maxQueryParams) {
    issues.push(error(`${base}.request.query`, `At most ${LIMITS.maxQueryParams} query parameters`));
  }
  if ((s.request.headers?.length ?? 0) > LIMITS.maxHeaders) {
    issues.push(error(`${base}.request.headers`, `At most ${LIMITS.maxHeaders} headers`));
  }

  if (s.request.body_type === "json" && typeof s.request.body === "string") {
    issues.push(
      error(
        `${base}.request.body`,
        "JSON body must be an object, not text — otherwise values can't be substituted safely"
      )
    );
  }

  for (const [field, rule] of [
    ["run_condition", s.run_condition],
    ["success_condition", s.success_condition],
  ] as const) {
    if (rule === null || rule === undefined) continue;
    validateRule(rule, `${base}.${field}`, issues);
    // A run condition is evaluated before the call, and the executor builds
    // its context with no `response` at all — so a leaf pointing at
    // `response.*` there is not "false", it is unanswerable, and it saved
    // cleanly then quietly skipped the step forever. Success conditions do
    // have the response in scope.
    if (field === "run_condition") {
      rejectResponsePaths(rule, `${base}.${field}`, issues);
    }
    if (countRuleNodes(rule) > LIMITS.maxRuleNodes) {
      issues.push(error(`${base}.${field}`, "This condition is too complex"));
    }
  }

  const mappings = s.output_map ?? [];
  if (mappings.length > LIMITS.maxOutputMappings) {
    issues.push(error(`${base}.output_map`, `At most ${LIMITS.maxOutputMappings} output fields`));
  }
  mappings.forEach((mapping, i) => {
    const at = `${base}.output_map[${i}]`;
    if (!mapping.field?.trim()) issues.push(error(at, "Output field needs a name"));
    if (!mapping.from?.trim()) issues.push(error(at, "Output field needs a source"));
    // Rejected here, not silently dropped later.
    //
    // The mapper already refuses to write these (it `continue`s past them),
    // so a definition naming one produced a field that never appeared, with
    // no diagnostic anywhere. The spec says these names are invalid; say so
    // at save time, where the author can act on it.
    if (mapping.field && BLOCKED_SEGMENTS.has(mapping.field.trim())) {
      issues.push(
        error(`${at}.field`, `"${mapping.field.trim()}" can't be used as an output field name`)
      );
    }
    if (mapping.transform && !VALID_TRANSFORMS.has(mapping.transform)) {
      issues.push(error(`${at}.transform`, `"${mapping.transform}" isn't a valid transform`));
    }
  });

  if (s.timeout_ms != null) {
    if (!Number.isFinite(s.timeout_ms) || s.timeout_ms < 500 || s.timeout_ms > LIMITS.maxStepTimeoutMs) {
      issues.push(
        error(`${base}.timeout_ms`, `Timeout must be between 500 and ${LIMITS.maxStepTimeoutMs} ms`)
      );
    }
  }
  if (s.max_key_attempts != null) {
    if (
      !Number.isInteger(s.max_key_attempts) ||
      s.max_key_attempts < 1 ||
      s.max_key_attempts > LIMITS.maxKeyAttemptsPerStep
    ) {
      issues.push(
        error(
          `${base}.max_key_attempts`,
          // Bounded low on purpose: this multiplies with the step count, and
          // every attempt is a paid upstream call.
          `Key retries must be between 1 and ${LIMITS.maxKeyAttemptsPerStep}`
        )
      );
    }
  }

  if (!["stop", "continue"].includes(s.on_success)) {
    issues.push(error(`${base}.on_success`, "on_success must be stop or continue"));
  }
  if (!["continue", "stop", "fail"].includes(s.on_failure)) {
    issues.push(error(`${base}.on_failure`, "on_failure must be continue, stop or fail"));
  }

  validateStepTemplates(s, index, allSteps, inputNames, issues);
}

export function validateEndpointDefinition(input: unknown): ValidationResult {
  const issues: Issue[] = [];

  if (!input || typeof input !== "object") {
    return { ok: false, issues: [error("", "Definition must be an object")] };
  }

  const raw = input as Record<string, unknown>;
  const steps = Array.isArray(raw.steps) ? (raw.steps as StepDef[]) : [];
  const inputs = Array.isArray(raw.inputs) ? raw.inputs : [];
  const outputs = Array.isArray(raw.outputs) ? raw.outputs : [];

  if (steps.length > LIMITS.maxSteps) {
    issues.push(
      error(
        "steps",
        // Each step is a paid call; the cap is what stops one request from
        // fanning out into an unbounded amount of spend.
        `An endpoint can have at most ${LIMITS.maxSteps} steps`
      )
    );
  }
  if (inputs.length > LIMITS.maxInputs) {
    issues.push(error("inputs", `At most ${LIMITS.maxInputs} inputs`));
  }

  const inputNames = new Set<string>();
  inputs.forEach((field, i) => {
    const f = field as { name?: string };
    if (!f.name?.trim()) {
      issues.push(error(`inputs[${i}].name`, "Input needs a name"));
      return;
    }
    if (inputNames.has(f.name)) {
      issues.push(error(`inputs[${i}].name`, `Two inputs are both called "${f.name}"`));
    }
    inputNames.add(f.name);
  });

  const seenKeys = new Set<string>();
  steps.forEach((step, i) => validateStep(step, i, steps, inputNames, seenKeys, issues));

  // Groups must be contiguous — a group split by an unrelated step in the
  // middle can't be expressed as "these run at the same time".
  let previousGroup: string | null = null;
  const closedGroups = new Set<string>();
  steps.forEach((step, i) => {
    const group = step.group ?? null;
    if (group && group !== previousGroup) {
      if (closedGroups.has(group)) {
        issues.push(error(`steps[${i}].group`, `Group "${group}" is split by other steps`));
      }
      closedGroups.add(group);
    }
    if (previousGroup && previousGroup !== group) closedGroups.add(previousGroup);
    previousGroup = group;
  });

  const settings = {
    ...DEFAULT_SETTINGS,
    ...((raw.settings as object) ?? {}),
  };
  if (settings.max_parallel < 1 || settings.max_parallel > LIMITS.maxParallel) {
    issues.push(
      error("settings.max_parallel", `Parallel width must be between 1 and ${LIMITS.maxParallel}`)
    );
  }

  const declaredOutputs = new Set(
    outputs.map((o) => (o as { field?: string }).field).filter(Boolean) as string[]
  );
  for (const required of settings.required_outputs ?? []) {
    if (declaredOutputs.size > 0 && !declaredOutputs.has(required)) {
      issues.push(
        warn("settings.required_outputs", `"${required}" is required but isn't a declared output`)
      );
    }
  }

  if (issues.some((i) => i.severity === "error")) {
    return { ok: false, issues };
  }

  // Unknown keys are preserved rather than dropped, so a definition written by
  // a newer build survives a round trip through an older one.
  const known = new Set(["version", "inputs", "steps", "outputs", "settings", "_extra"]);
  const extra: Record<string, unknown> = { ...((raw._extra as object) ?? {}) };
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) extra[key] = value;
  }

  const value: EndpointDefinition = {
    version: 1,
    inputs: inputs as EndpointDefinition["inputs"],
    steps,
    outputs: outputs as EndpointDefinition["outputs"],
    settings,
    ...(Object.keys(extra).length > 0 ? { _extra: extra } : {}),
  };

  return { ok: true, value, issues };
}
