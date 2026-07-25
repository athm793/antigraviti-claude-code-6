import {
  applyTemplateToJson,
  renderToString,
  renderTemplate,
  OMIT,
  type TemplateContext,
} from "./template";
import type { StepDef } from "../endpointTypes";

/**
 * Turning a step definition plus a run context into an actual HTTP request.
 *
 * This is the security-critical seam: parts of the URL, headers and body come
 * from the caller's input, and the request that goes out carries a real API
 * key.
 */

export interface BuiltRequest {
  path: string;
  queryString: string;
  headers: Headers;
  body: ArrayBuffer | null;
  bodyPreview: string | null;
  unresolved: string[];
}

export type BuildError =
  | { kind: "template_missing"; detail: string }
  | { kind: "invalid_path"; detail: string }
  | { kind: "invalid_header"; detail: string };

export type BuildResult =
  | { ok: true; request: BuiltRequest }
  | { ok: false; error: BuildError };

/** Headers a step may never set — these are the proxy's to control. */
const RESERVED_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "x-master-key",
  "x-endpoint-key",
]);

export function buildStepRequest(
  step: StepDef,
  ctx: TemplateContext,
  authHeaderName: string
): BuildResult {
  const unresolved: string[] = [];

  // --- Path -----------------------------------------------------------
  //
  // Each segment is resolved and encoded separately, then rejoined. Encoding
  // the *resolved value* rather than the assembled path is what stops an input
  // of "../../admin" or "x?admin=1" from restructuring the URL and reaching
  // somewhere the endpoint author never intended.
  const rawPath = step.request.path || "/";
  const segments: string[] = [];

  for (const rawSegment of rawPath.split("/")) {
    if (rawSegment === "") {
      segments.push("");
      continue;
    }

    const rendered = renderTemplate(rawSegment, ctx, "fail");
    unresolved.push(...rendered.unresolved);
    if (rendered.failed) {
      return {
        ok: false,
        error: {
          kind: "template_missing",
          // Failing here costs nothing. Letting an empty segment through would
          // send a real, billed request to a URL that can only 404.
          detail: `Path needs ${rendered.unresolved.join(", ")}, which had no value`,
        },
      };
    }

    const value = rendered.value === OMIT ? "" : rendered.value;
    const text = typeof value === "string" ? value : String(value);
    if (text === "." || text === "..") {
      return {
        ok: false,
        error: { kind: "invalid_path", detail: "Path segments can't be . or .." },
      };
    }
    segments.push(encodeURIComponent(text));
  }

  let path = segments.join("/");
  if (!path.startsWith("/")) path = `/${path}`;

  // --- Query ----------------------------------------------------------
  //
  // Built with URLSearchParams rather than string concatenation, so a value
  // containing & or = can't add parameters of its own.
  const params = new URLSearchParams();
  for (const { key, value } of step.request.query ?? []) {
    if (!key?.trim()) continue;
    const renderedKey = renderToString(key, ctx, "empty");
    const renderedValue = renderTemplate(value ?? "", ctx, "omit");
    unresolved.push(...renderedKey.unresolved, ...renderedValue.unresolved);

    // A parameter whose value is missing is dropped entirely: "?email=" and
    // omitting "email" mean different things to most APIs.
    if (renderedValue.value === OMIT || renderedValue.value === undefined) continue;
    if (!renderedKey.text) continue;

    const text =
      typeof renderedValue.value === "string"
        ? renderedValue.value
        : String(renderedValue.value);
    params.append(renderedKey.text, text);
  }
  const queryString = params.toString() ? `?${params.toString()}` : "";

  // --- Headers --------------------------------------------------------
  const headers = new Headers();
  for (const { key, value } of step.request.headers ?? []) {
    if (!key?.trim()) continue;
    const name = key.trim();
    const lower = name.toLowerCase();

    if (RESERVED_HEADERS.has(lower)) {
      return {
        ok: false,
        error: { kind: "invalid_header", detail: `"${name}" can't be set by a step` },
      };
    }
    if (lower === authHeaderName.toLowerCase()) {
      return {
        ok: false,
        error: {
          kind: "invalid_header",
          detail: `"${name}" is set automatically from the provider's key pool`,
        },
      };
    }

    const rendered = renderTemplate(value ?? "", ctx, "omit");
    unresolved.push(...rendered.unresolved);
    if (rendered.value === OMIT || rendered.value === undefined) continue;

    const text =
      typeof rendered.value === "string" ? rendered.value : String(rendered.value);
    // A resolved value containing CR or LF could split the request and forge
    // additional headers. Fail loudly rather than letting undici throw.
    if (/[\r\n]/.test(text)) {
      return {
        ok: false,
        error: { kind: "invalid_header", detail: `"${name}" resolved to a value with a line break` },
      };
    }
    headers.set(name, text);
  }

  // --- Body -----------------------------------------------------------
  let body: ArrayBuffer | null = null;
  let bodyPreview: string | null = null;

  if (step.request.body_type === "json") {
    const built = applyTemplateToJson(step.request.body ?? {}, ctx, unresolved);
    const text = JSON.stringify(built === OMIT ? {} : built) ?? "{}";
    bodyPreview = text;
    body = new TextEncoder().encode(text).buffer as ArrayBuffer;
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  } else if (step.request.body_type === "raw") {
    const rendered = renderToString(String(step.request.body ?? ""), ctx, "empty");
    unresolved.push(...rendered.unresolved);
    bodyPreview = rendered.text;
    body = new TextEncoder().encode(rendered.text).buffer as ArrayBuffer;
  }

  return {
    ok: true,
    request: { path, queryString, headers, body, bodyPreview, unresolved },
  };
}
