/**
 * Engine verification.
 *
 * Pure functions only — no network, no database, no API credits — so this can
 * run on every change. Most of these assert security properties (injection,
 * traversal, prototype pollution) and the one behaviour the whole feature
 * rests on: a 200 response with an empty result must NOT count as resolved.
 *
 * Run with: npm test
 */
import { renderTemplate, applyTemplateToJson, OMIT } from "../.engine-build/engine/template.js";
import { evaluateRule, defaultSuccessRule } from "../.engine-build/engine/rules.js";
import { applyOutputMap, mergeOutput, collectOutput } from "../.engine-build/engine/mapping.js";
import { buildStepRequest } from "../.engine-build/engine/request.js";
import { validateEndpointDefinition } from "../.engine-build/engine/validate.js";

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else failures.push(`${name}\n    expected: ${e}\n    actual:   ${a}`);
}

function ok(name, condition, detail = "") {
  if (condition) pass++;
  else failures.push(`${name}${detail ? `\n    ${detail}` : ""}`);
}

const ctx = {
  input: { domain: "acme.com", limit: 50, verified: true, tags: ["a", "b"], zero: 0, blank: "" },
  steps: {
    prospeo: {
      status: 200,
      headers: { "content-type": "application/json" },
      body: { data: { email: "ana@acme.com", score: "92" } },
      output: { email: "ana@acme.com" },
      ok: true,
    },
  },
  response: { status: 200, headers: {}, body: { email: null, list: [{ v: 1 }, { v: 2 }] } },
  run: { id: "run-1", started_at: "2026-01-01T00:00:00Z" },
};

// ---------------------------------------------------------------- templates
check("sole placeholder keeps number type", renderTemplate("{{input.limit}}", ctx).value, 50);
check("sole placeholder keeps boolean type", renderTemplate("{{input.verified}}", ctx).value, true);
check("sole placeholder keeps array type", renderTemplate("{{input.tags}}", ctx).value, ["a", "b"]);
check("interpolation makes a string", renderTemplate("d={{input.domain}}", ctx).value, "d=acme.com");
check("number interpolates into text", renderTemplate("n={{input.limit}}", ctx).value, "n=50");
check("nested step path", renderTemplate("{{steps.prospeo.body.data.email}}", ctx).value, "ana@acme.com");
check("array index", renderTemplate("{{response.body.list[1].v}}", ctx).value, 2);
check("negative index takes last", renderTemplate("{{response.body.list[-1].v}}", ctx).value, 2);

ok("missing path is OMIT under omit policy", renderTemplate("{{input.nope}}", ctx, "omit").value === OMIT);
check("missing path is empty under empty policy", renderTemplate("{{input.nope}}", ctx, "empty").value, "");
ok("missing path fails under fail policy", renderTemplate("{{input.nope}}", ctx, "fail").failed === true);
ok("zero is a real value, not missing", renderTemplate("{{input.zero}}", ctx, "omit").value === 0);

// Prototype pollution: the read side must refuse these segments outright.
ok("__proto__ is not traversable", renderTemplate("{{input.__proto__}}", ctx, "omit").value === OMIT);
ok("constructor is not traversable", renderTemplate("{{input.constructor}}", ctx, "omit").value === OMIT);
ok("unknown root rejected", renderTemplate("{{process.env.SECRET}}", ctx, "omit").value === OMIT);
ok("env root rejected", renderTemplate("{{env.DATABASE_URL}}", ctx, "omit").value === OMIT);

// -------------------------------------------------------------- json bodies
const hostile = {
  input: { name: 'Acme", "isAdmin": true, "x": "', quote: 'say "hi"', nl: "a\nb" },
  steps: {}, run: { id: "r", started_at: "" },
};
const built = applyTemplateToJson({ company: "{{input.name}}", note: "{{input.quote}}" }, hostile, []);
const serialised = JSON.stringify(built);
const reparsed = JSON.parse(serialised);
check("quote injection cannot add fields", Object.keys(reparsed).sort(), ["company", "note"]);
ok("injected text stays inside its own value", reparsed.isAdmin === undefined,
  `got keys: ${Object.keys(reparsed)}`);
check("value survives round trip intact", reparsed.company, 'Acme", "isAdmin": true, "x": "');
check("newlines survive", applyTemplateToJson({ a: "{{input.nl}}" }, hostile, []).a, "a\nb");

const pollute = applyTemplateToJson({ __proto__: "x", ok: "y" }, hostile, []);
ok("__proto__ key dropped from built body", !Object.prototype.hasOwnProperty.call(pollute, "__proto__"));
ok("Object.prototype not polluted", {}.x === undefined);

const omitted = applyTemplateToJson({ a: "{{input.missing}}", b: "kept" }, hostile, []);
check("missing json key omitted, not blanked", Object.keys(omitted), ["b"]);

// -------------------------------------------------------------------- rules
const rctx = {
  ...ctx,
  status: 200,
  headers: { "content-type": "application/json", "x-count": "5" },
  body: { email: null, score: 0, flag: false, name: "Ana", list: [] },
  output: { email: "", phone: "+1" },
  latency_ms: 10,
  error: null,
};

const r = (rule) => evaluateRule(rule, rctx).result;

ok("status eq matches", r({ path: "status", op: "eq", value: 200 }));
ok("status as string still matches number", r({ path: "status", op: "eq", value: "200" }));
ok("null value is empty", r({ path: "body.email", op: "empty" }));
ok("null value does not exist", r({ path: "body.email", op: "not_exists" }));
ok("zero is NOT empty", !r({ path: "body.score", op: "empty" }), "0 must count as a real answer");
ok("false is NOT empty", !r({ path: "body.flag", op: "empty" }), "false must count as a real answer");
ok("empty array is empty", r({ path: "body.list", op: "empty" }));
ok("empty string output is empty", r({ path: "output.email", op: "empty" }));
ok("filled output is not empty", r({ path: "output.phone", op: "not_empty" }));
ok("header lookup is case-insensitive", r({ path: "headers.Content-Type", op: "contains", value: "json" }));
ok("missing header not_exists", r({ path: "headers.x-nope", op: "not_exists" }));
ok("contains on string", r({ path: "body.name", op: "contains", value: "An" }));
ok("in list", r({ path: "status", op: "in", value: [200, 201] }));
ok("not_in list", r({ path: "status", op: "not_in", value: [404, 500] }));
ok("gt numeric on numeric string header", r({ path: "headers.x-count", op: "gt", value: 3 }));
ok("gt with non-numeric is false, not an error", !r({ path: "body.name", op: "gt", value: 3 }));
ok("all of", r({ all: [{ path: "status", op: "eq", value: 200 }, { path: "body.name", op: "not_empty" }] }));
ok("any of", r({ any: [{ path: "status", op: "eq", value: 500 }, { path: "body.name", op: "not_empty" }] }));
ok("not", r({ not: { path: "status", op: "eq", value: 500 } }));
ok("empty all is true", r({ all: [] }));
ok("empty any is false", !r({ any: [] }));

// The behaviour the whole feature depends on: 200 with a null email is NOT a hit.
const nullEmailCtx = { ...rctx, status: 200, output: { email: null } };
ok("200 with null email does not count as resolved",
  !evaluateRule(defaultSuccessRule(["email"]), nullEmailCtx).result,
  "this is what makes the waterfall fall through");
const goodCtx = { ...rctx, status: 200, output: { email: "a@b.com" } };
ok("200 with an email does count as resolved",
  evaluateRule(defaultSuccessRule(["email"]), goodCtx).result);
const badStatus = { ...rctx, status: 404, output: { email: "a@b.com" } };
ok("404 never counts as resolved", !evaluateRule(defaultSuccessRule(["email"]), badStatus).result);

// ------------------------------------------------------------------ mapping
const mapped = applyOutputMap(
  [
    { field: "email", from: "{{steps.prospeo.body.data.email}}", transform: "lower" },
    { field: "score", from: "{{steps.prospeo.body.data.score}}", transform: "number" },
    { field: "missing", from: "{{input.nope}}", transform: "none" },
    { field: "__proto__", from: "{{input.domain}}", transform: "none" },
  ],
  ctx
);
check("mapped email", mapped.output.email, "ana@acme.com");
check("string score parsed to number", mapped.output.score, 92);
ok("missing source writes nothing", !("missing" in mapped.output));
ok("__proto__ target refused", !Object.prototype.hasOwnProperty.call(mapped.output, "__proto__"));
ok("Object.prototype still clean after mapping", {}.email === undefined);

check("first write wins", mergeOutput({ email: "first@x.com" }, { email: "second@x.com" }).email, "first@x.com");
check("empty never overwrites", mergeOutput({ email: "kept@x.com" }, { email: "" }).email, "kept@x.com");
check("gap gets filled", mergeOutput({ email: "a@b.com" }, { phone: "+1" }).phone, "+1");
check("collect gathers values", collectOutput({ email: ["a@b.com"] }, { email: "c@d.com" }).email, ["a@b.com", "c@d.com"]);

// ------------------------------------------------------------------ request
const step = {
  key: "s", name: "S", config_id: "c", group: null, enabled: true,
  request: {
    method: "POST", path: "/v1/find/{{input.domain}}",
    query: [{ key: "limit", value: "{{input.limit}}" }, { key: "skip", value: "{{input.nope}}" }],
    headers: [{ key: "X-Trace", value: "{{run.id}}" }],
    body_type: "json", body: { q: "{{input.domain}}" },
  },
  run_condition: null, success_condition: null, output_map: [],
  on_success: "stop", on_failure: "continue",
  timeout_ms: null, max_key_attempts: null, cost_per_call_cents: null,
};

const req = buildStepRequest(step, ctx, "X-API-KEY");
ok("request builds", req.ok, req.ok ? "" : JSON.stringify(req.error));
if (req.ok) {
  check("path templated", req.request.path, "/v1/find/acme.com");
  check("query includes resolved value", req.request.queryString, "?limit=50");
  check("header templated", req.request.headers.get("x-trace"), "run-1");
  check("json body built", req.request.bodyPreview, '{"q":"acme.com"}');
}

// Path traversal must not escape the provider's base path.
const traversal = { ...step, request: { ...step.request, path: "/v1/{{input.evil}}" } };
const tctx = { ...ctx, input: { ...ctx.input, evil: "../../admin/keys" } };
const treq = buildStepRequest(traversal, tctx, "X-API-KEY");
ok("traversal encoded, not obeyed",
  treq.ok && treq.request.path === "/v1/..%2F..%2Fadmin%2Fkeys",
  treq.ok ? `got ${treq.request.path}` : JSON.stringify(treq.error));

const qinject = { ...step, request: { ...step.request, path: "/v1/x", query: [{ key: "q", value: "{{input.evil}}" }] } };
const qctx = { ...ctx, input: { ...ctx.input, evil: "a&admin=1" } };
const qreq = buildStepRequest(qinject, qctx, "X-API-KEY");
ok("query injection encoded",
  qreq.ok && qreq.request.queryString === "?q=a%26admin%3D1",
  qreq.ok ? `got ${qreq.request.queryString}` : "build failed");

const crlf = { ...step, request: { ...step.request, headers: [{ key: "X-Evil", value: "{{input.evil}}" }] } };
const cctx = { ...ctx, input: { ...ctx.input, evil: "a\r\nX-Injected: 1" } };
ok("CRLF in a header is rejected", buildStepRequest(crlf, cctx, "X-API-KEY").ok === false);

const authClash = { ...step, request: { ...step.request, headers: [{ key: "x-api-key", value: "mine" }] } };
ok("step cannot override the provider's auth header", buildStepRequest(authClash, ctx, "X-API-KEY").ok === false);

const hostClash = { ...step, request: { ...step.request, headers: [{ key: "Host", value: "evil.com" }] } };
ok("step cannot set Host", buildStepRequest(hostClash, ctx, "X-API-KEY").ok === false);

const missingPath = { ...step, request: { ...step.request, path: "/v1/{{input.nope}}" } };
ok("missing path value fails the step before any call is made",
  buildStepRequest(missingPath, ctx, "X-API-KEY").ok === false);

// --------------------------------------------------------------- validation
const baseStep = (over = {}) => ({
  key: "a", name: "A", config_id: "c1", group: null, enabled: true,
  request: { method: "GET", path: "/x", query: [], headers: [], body_type: "none", body: null },
  run_condition: null, success_condition: null, output_map: [],
  on_success: "stop", on_failure: "continue",
  timeout_ms: null, max_key_attempts: null, cost_per_call_cents: null,
  ...over,
});
const def = (steps, extra = {}) => ({ version: 1, inputs: [], steps, outputs: [], settings: {}, ...extra });

ok("valid definition passes", validateEndpointDefinition(def([baseStep()])).ok);

const dup = validateEndpointDefinition(def([baseStep(), baseStep({ name: "B" })]));
ok("duplicate step reference rejected", !dup.ok);

const forward = validateEndpointDefinition(def([
  baseStep({ key: "a", request: { method: "GET", path: "/x/{{steps.b.output.email}}", query: [], headers: [], body_type: "none", body: null } }),
  baseStep({ key: "b", name: "B" }),
]));
ok("forward reference rejected", !forward.ok,
  "a step must not read a step that runs after it");

const sameGroup = validateEndpointDefinition(def([
  baseStep({ key: "a", group: "g1" }),
  baseStep({ key: "b", name: "B", group: "g1", request: { method: "GET", path: "/x/{{steps.a.output.email}}", query: [], headers: [], body_type: "none", body: null } }),
]));
ok("sibling reference inside a parallel group rejected", !sameGroup.ok,
  "they run at the same time, so ordering is not guaranteed");

const selfRef = validateEndpointDefinition(def([
  baseStep({ request: { method: "GET", path: "/x/{{steps.a.output.email}}", query: [], headers: [], body_type: "none", body: null } }),
]));
ok("self reference rejected", !selfRef.ok);

const tooMany = validateEndpointDefinition(def(
  Array.from({ length: 20 }, (_, i) => baseStep({ key: `s${i}`, name: `S${i}` }))
));
ok("step count cap enforced", !tooMany.ok);

const stringJson = validateEndpointDefinition(def([
  baseStep({ request: { method: "GET", path: "/x", query: [], headers: [], body_type: "json", body: '{"a":"{{input.x}}"}' } }),
]));
ok("json body as a raw string rejected", !stringJson.ok,
  "string bodies would have to be spliced, which is the injection path");

const badOp = validateEndpointDefinition(def([
  baseStep({ success_condition: { path: "status", op: "regex", value: ".*" } }),
]));
ok("unknown operator rejected", !badOp.ok);

const kept = validateEndpointDefinition({ ...def([baseStep()]), futureField: { a: 1 } });
ok("unknown top-level keys preserved, not stripped",
  kept.ok && kept.value._extra && kept.value._extra.futureField !== undefined);

const splitGroup = validateEndpointDefinition(def([
  baseStep({ key: "a", group: "g" }),
  baseStep({ key: "b", name: "B", group: null }),
  baseStep({ key: "c", name: "C", group: "g" }),
]));
ok("non-contiguous parallel group rejected", !splitGroup.ok);

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log("  all engine checks passed\n");
