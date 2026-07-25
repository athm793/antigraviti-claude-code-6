import {
  OPERATORS,
  UNARY_OPERATORS,
  type EndpointDefinition,
  type Rule,
  type RuleLeaf,
} from "../endpointTypes";

/**
 * Turns a step's run-condition into a sentence.
 *
 * This is what makes the collapsed step list readable top to bottom —
 * "Always runs", "Runs if step 1 found no email" — so the shape of the
 * waterfall is obvious without opening anything.
 */

const OPERATOR_LABELS = new Map(OPERATORS.map((o) => [o.value, o.label]));

function isLeaf(rule: Rule): rule is RuleLeaf {
  return typeof (rule as RuleLeaf).path === "string";
}

/** "steps.prospeo.output.email" -> "step 1's email" */
function describePath(path: string, definition: EndpointDefinition): string {
  if (path === "status") return "the status code";

  const stepMatch = path.match(/^steps\.([a-z][a-z0-9_]*)\.(?:output|body)\.?(.*)$/);
  if (stepMatch) {
    const [, key, field] = stepMatch;
    const index = (definition.steps ?? []).findIndex((s) => s.key === key);
    const label = index >= 0 ? `step ${index + 1}` : key;
    return field ? `${label}'s ${field}` : label;
  }

  if (path.startsWith("input.")) return `the ${path.slice("input.".length)} you send in`;
  if (path.startsWith("output.")) return `its ${path.slice("output.".length)}`;
  if (path.startsWith("response.body.")) return `its ${path.slice("response.body.".length)}`;
  return path;
}

function describeLeaf(leaf: RuleLeaf, definition: EndpointDefinition): string {
  const subject = describePath(leaf.path, definition);
  const verb = OPERATOR_LABELS.get(leaf.op) ?? leaf.op;
  if (UNARY_OPERATORS.has(leaf.op)) return `${subject} ${verb}`;
  const value = Array.isArray(leaf.value) ? leaf.value.join(", ") : String(leaf.value ?? "");
  return `${subject} ${verb} ${value}`;
}

function describeRule(rule: Rule, definition: EndpointDefinition, depth = 0): string {
  if (depth > 4) return "a nested condition";
  if (isLeaf(rule)) return describeLeaf(rule, definition);

  if ("all" in rule) {
    if (rule.all.length === 0) return "";
    return rule.all.map((r) => describeRule(r, definition, depth + 1)).join(" and ");
  }
  if ("any" in rule) {
    if (rule.any.length === 0) return "";
    return rule.any.map((r) => describeRule(r, definition, depth + 1)).join(" or ");
  }
  return `not ${describeRule(rule.not, definition, depth + 1)}`;
}

export function describeCondition(definition: EndpointDefinition, stepIndex: number): string {
  const step = (definition.steps ?? [])[stepIndex];
  if (!step) return "";

  if (!step.run_condition) {
    // The first step of a waterfall always runs; later ones only run because
    // everything before them stopped short, which is worth saying explicitly.
    if (stepIndex === 0) return "Always runs";
    const previous = (definition.steps ?? [])
      .slice(0, stepIndex)
      .filter((s) => s.enabled && s.on_success === "stop");
    if (previous.length === 0) return "Always runs";
    return previous.length === 1
      ? "Runs if step 1 didn't answer"
      : `Runs if steps 1–${previous.length} didn't answer`;
  }

  const described = describeRule(step.run_condition, definition);
  return described ? `Runs if ${described}` : "Always runs";
}
