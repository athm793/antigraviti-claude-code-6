import type { ProxyConfig } from "./types";
import {
  executeWithRotation,
  recoverCooldownKeys,
  sanitizeResponseHeaders,
} from "./rotation";
import { logEvent } from "./log";

/**
 * Whole-rotation budget for a pass-through request.
 *
 * The route declares maxDuration = 60. Stopping at 50s leaves room to return a
 * real 503 and write the log line, the same 10s margin the waterfall runner
 * keeps for the same reason: a platform hard-kill produces no record at all.
 */
const PROXY_ROTATION_BUDGET_MS = 50_000;

/**
 * Pass-through proxy.
 *
 * A thin adapter over the shared rotation engine in rotation.ts. The response
 * body is streamed straight through and never read here — that is what keeps
 * an arbitrarily large upstream response cheap, and it's the property the
 * waterfall executor deliberately gives up in exchange for being able to
 * inspect the body.
 */
export async function handleProxyRequest(
  config: ProxyConfig,
  path: string,
  queryString: string,
  method: string,
  incomingHeaders: Headers,
  body: ArrayBuffer | null
): Promise<Response> {
  await recoverCooldownKeys(config);

  const result = await executeWithRotation(config, {
    path,
    queryString,
    method,
    headers: incomingHeaders,
    body,
    // Re-check where this actually resolves, immediately before the fetch.
    //
    // Save-time validation is literal-only by construction — it cannot see
    // what a hostname resolves to, so a domain whose DNS points at 10.0.0.1
    // passes it. This used to be skipped here on the reasoning that the
    // operator already set the target, but any account holder can create a
    // provider and set its target, so "the operator" is not necessarily
    // someone trusted with the deployment's internal network. Every other
    // caller of this engine verifies; the proxy was the odd one out.
    verifyTarget: true,
    // Bound the whole rotation, not just each attempt. Without a deadline a
    // large, fully rate-limited pool can burn the entire function budget at
    // 30s per attempt and return a platform 504 — no structured error, no log
    // line, and no exhaustion webhook, precisely when the operator needs all
    // three.
    deadlineAt: Date.now() + PROXY_ROTATION_BUDGET_MS,
  });

  // Path only — never the query string, which routinely carries lookup
  // subjects (emails, names) that don't belong in an ops log.
  logEvent(result.ok ? "info" : "warn", "proxy_request", {
    config_id: config.id,
    method,
    path,
    outcome: result.ok ? "ok" : (result.error?.kind ?? "unknown"),
    upstream_status: result.ok && result.response ? result.response.status : null,
    attempts: result.attempts,
    keys_exhausted: result.keysExhausted,
    latency_ms: result.latencyMs,
  });

  if (result.ok && result.response) {
    return new Response(result.response.body, {
      status: result.response.status,
      headers: sanitizeResponseHeaders(result.response.headers),
    });
  }

  switch (result.error?.kind) {
    case "no_keys":
      return Response.json(
        { error: "All API keys exhausted", proxy: true },
        { status: 503 }
      );
    case "all_exhausted":
      return Response.json(
        { error: "All API keys exhausted after rotation", proxy: true },
        { status: 503 }
      );
    case "blocked_target":
      return Response.json(
        { error: "Request blocked", detail: result.error.detail, proxy: true },
        { status: 400 }
      );
    case "timeout":
      return Response.json(
        { error: "Upstream timed out", proxy: true },
        { status: 504 }
      );
    default:
      // Deliberately generic: the old message interpolated the raw fetch error,
      // which leaked the target hostname (and any userinfo in it) to whoever
      // held the master key.
      return Response.json(
        { error: "Upstream fetch failed", proxy: true },
        { status: 502 }
      );
  }
}

export function extractMasterKey(headers: Headers): string | null {
  const xKey = headers.get("x-master-key");
  if (xKey) return xKey;
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}
