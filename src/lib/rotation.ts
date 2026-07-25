import type { ProxyConfig, ApiKey } from "./types";
import {
  getActiveKey,
  markKeyExhausted,
  incrementRequestCount,
  resetCooldownKeys,
} from "./db";
import { assertResolvesPublic } from "./validation";

/**
 * The key-rotation engine.
 *
 * Extracted from proxy.ts so two very different callers can share it:
 *
 *  - the pass-through proxy, which wants to stream the upstream response back
 *    untouched and knows nothing about its contents;
 *  - the waterfall executor, which must parse the body to evaluate conditions
 *    and map output fields, and needs to know which key was used, how many
 *    attempts it took, and how many keys got burned.
 *
 * So this returns the response *unconsumed* plus the metadata, and lets the
 * caller decide whether to stream or read it. Wrapping the old function and
 * calling .text() on its result would have thrown away everything the
 * executor's trace needs.
 */

export const MAX_ROTATION_ATTEMPTS = 200;

/**
 * Per-attempt ceiling. The proxy previously had no timeout at all, so a
 * hanging upstream burned the entire function budget and returned a platform
 * 504 with nothing logged. Tunable because the right value depends on how slow
 * the slowest provider in your stack legitimately is.
 */
export const DEFAULT_ATTEMPT_TIMEOUT_MS = (() => {
  const raw = Number(process.env.PROXY_ATTEMPT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30_000;
})();

/** Never start an attempt with less than this left on the clock. */
const MIN_ATTEMPT_BUDGET_MS = 750;

export type RotationErrorKind =
  | "no_keys"
  | "all_exhausted"
  | "fetch_failed"
  | "timeout"
  | "deadline"
  | "blocked_target";

export interface RotationRequest {
  /** Resolved path with a leading slash. */
  path: string;
  /** "" or "?a=b". */
  queryString: string;
  method: string;
  /** Caller-built. The auth header is set here, last, and always wins. */
  headers: Headers;
  body: ArrayBuffer | null;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Epoch ms hard stop for the whole rotation loop. */
  deadlineAt?: number;
  maxAttempts?: number;
  /**
   * Keys already burned earlier in this run. Without it, a waterfall step that
   * just exhausted a key can immediately reselect it, because selection is
   * "lowest order_index that is active" and the exhaust may not have landed.
   */
  excludeKeyIds?: Set<number>;
  /**
   * Re-validate where this is actually going, immediately before the fetch.
   * On for waterfall steps; off for the pass-through proxy, which would pay
   * a DNS lookup on every request for a target the operator already set.
   */
  verifyTarget?: boolean;
}

export interface RotationResult {
  ok: boolean;
  /** UNCONSUMED — the caller chooses to stream or parse it. */
  response: Response | null;
  url: string;
  attempts: number;
  keysExhausted: number;
  keyId: number | null;
  keyOrderIndex: number | null;
  latencyMs: number;
  error: { kind: RotationErrorKind; detail?: string } | null;
}

const HOP_BY_HOP_REQUEST = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "accept-encoding",
  // KeyProxy's own credentials must never reach a vendor.
  "x-master-key",
  "x-endpoint-key",
  // Vercel infrastructure headers — must not reach the target API
  "forwarded",
  "x-real-ip",
  "x-invocation-id",
  "x-matched-path",
  "x-vercel-sc-basepath",
  "x-vercel-sc-headers",
  "x-vercel-sc-host",
]);

function isInfraHeader(name: string): boolean {
  return name.startsWith("x-vercel-") || name.startsWith("x-forwarded-");
}

const HOP_BY_HOP_RESPONSE = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

export async function executeWithRotation(
  config: ProxyConfig,
  req: RotationRequest
): Promise<RotationResult> {
  const started = Date.now();
  const rateLimitCodes = new Set(config.rate_limit_codes);
  const maxAttempts = req.maxAttempts ?? MAX_ROTATION_ATTEMPTS;
  const attemptTimeout = req.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const exclude = req.excludeKeyIds ?? new Set<number>();

  const base = (result: Partial<RotationResult>): RotationResult => ({
    ok: false,
    response: null,
    url: buildTargetUrl(config.target_base_url, req.path, req.queryString),
    attempts: 0,
    keysExhausted: 0,
    keyId: null,
    keyOrderIndex: null,
    latencyMs: Date.now() - started,
    error: null,
    ...result,
  });

  const targetUrl = buildTargetUrl(config.target_base_url, req.path, req.queryString);

  // Containment check. A resolved path must never be able to restructure the
  // URL — `..` segments or an absolute URL landing in a template would
  // otherwise send this request, carrying a live API key, somewhere the
  // operator never configured.
  if (!isWithinBase(config.target_base_url, targetUrl)) {
    return base({
      error: {
        kind: "blocked_target",
        detail: "Resolved URL escaped the provider's base URL",
      },
    });
  }

  if (req.verifyTarget) {
    const check = await assertResolvesPublic(targetUrl);
    if (!check.ok) {
      return base({ error: { kind: "blocked_target", detail: check.message } });
    }
  }

  let attempts = 0;
  let keysExhausted = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (req.deadlineAt && Date.now() + MIN_ATTEMPT_BUDGET_MS > req.deadlineAt) {
      return base({
        attempts,
        keysExhausted,
        error: { kind: "deadline", detail: "Ran out of time before the next attempt" },
      });
    }

    const key = await getActiveKey(config.id, exclude);
    if (!key) {
      return base({
        attempts,
        keysExhausted,
        error: {
          kind: attempts === 0 ? "no_keys" : "all_exhausted",
          detail:
            attempts === 0
              ? "No active API keys in this provider's pool"
              : "Every key in the pool was rate-limited",
        },
      });
    }

    attempts++;

    const controller = new AbortController();
    // Never let one attempt outlive the run's overall budget.
    const remaining = req.deadlineAt ? req.deadlineAt - Date.now() : attemptTimeout;
    const timeoutMs = Math.max(MIN_ATTEMPT_BUDGET_MS, Math.min(attemptTimeout, remaining));
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let upstream: Response;
    try {
      upstream = await fetch(targetUrl, {
        method: req.method,
        headers: buildForwardHeaders(config, key, req.headers),
        body: req.body && req.body.byteLength > 0 ? req.body : undefined,
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return base({
        attempts,
        keysExhausted,
        keyId: key.id,
        keyOrderIndex: key.order_index,
        error: {
          kind: aborted ? "timeout" : "fetch_failed",
          detail: aborted
            ? `Upstream did not respond within ${timeoutMs}ms`
            : "Could not reach the upstream API",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (rateLimitCodes.has(upstream.status)) {
      // Drain so the connection can be reused rather than left dangling.
      void upstream.body?.cancel().catch(() => {});
      const won = await markKeyExhausted(key.id, config.cooldown_minutes);
      if (won) keysExhausted++;
      // Even if another request won the race, don't reconsider this key here.
      exclude.add(key.id);
      continue;
    }

    await incrementRequestCount(key.id);

    return {
      ok: true,
      response: upstream,
      url: targetUrl,
      attempts,
      keysExhausted,
      keyId: key.id,
      keyOrderIndex: key.order_index,
      latencyMs: Date.now() - started,
      error: null,
    };
  }

  return base({
    attempts,
    keysExhausted,
    error: {
      kind: "all_exhausted",
      detail: `Every key was rate-limited across ${attempts} attempts`,
    },
  });
}

/**
 * Cooldown recovery. Hoisted out of the request path so a waterfall touching
 * five providers does one of these per provider per run rather than one per
 * step attempt.
 */
export async function recoverCooldownKeys(config: ProxyConfig): Promise<number> {
  if (config.cooldown_minutes <= 0) return 0;
  return resetCooldownKeys(config.id, config.cooldown_minutes);
}

export function buildTargetUrl(
  baseUrl: string,
  path: string,
  queryString: string
): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${path}${queryString}`;
}

/** True when the assembled URL is still on the provider's origin and base path. */
export function isWithinBase(baseUrl: string, candidate: string): boolean {
  try {
    const base = new URL(baseUrl);
    const url = new URL(candidate);
    if (url.origin !== base.origin) return false;
    const basePath = base.pathname.replace(/\/$/, "");
    return url.pathname === basePath || url.pathname.startsWith(`${basePath}/`);
  } catch {
    return false;
  }
}

/**
 * Caller headers that are safe to pass upstream — hop-by-hop, infrastructure
 * and KeyProxy's own credentials removed. Split out from buildForwardHeaders
 * so the debug inspector can show what would be sent without needing a real
 * key in hand.
 */
export function filterForwardableHeaders(incoming: Headers): Headers {
  const out = new Headers();
  for (const [name, value] of incoming.entries()) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_REQUEST.has(lower)) continue;
    if (isInfraHeader(lower)) continue;
    if (lower === "authorization") continue;
    out.set(name, value);
  }
  return out;
}

export function buildForwardHeaders(
  config: ProxyConfig,
  key: ApiKey,
  incoming: Headers
): Headers {
  const out = filterForwardableHeaders(incoming);
  // Set last so a caller-supplied header can never displace the injected key.
  out.set(config.auth_header_name, `${config.auth_header_prefix}${key.key_value}`);
  return out;
}

export function sanitizeResponseHeaders(incoming: Headers): Headers {
  const out = new Headers();
  for (const [name, value] of incoming.entries()) {
    if (HOP_BY_HOP_RESPONSE.has(name.toLowerCase())) continue;
    out.set(name, value);
  }
  return out;
}
