import { extractEndpointKey } from "@/lib/endpointKeys";
import {
  authenticateEndpointKey,
  consumeEndpointRate,
  getActiveDefinition,
  touchEndpointKey,
} from "@/lib/endpointsDb";
import { validateRunInput } from "@/lib/engine/input";
import { executeEndpointRun, HARD_DEADLINE_MS } from "@/lib/runner";
import type { RunResult } from "@/lib/engine/execute";

/**
 * The public endpoint. One URL, one JSON body in, one normalized result out.
 *
 * Authenticated by a hashed endpoint key, never by a session — this is called
 * by Clay, n8n, Make and scripts, not by a browser.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Bigger than any sane enrichment input, small enough not to be a DoS lever. */
const MAX_INPUT_BYTES = 128 * 1024;

function json(body: unknown, status: number, headers?: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

/**
 * A run that found nothing is HTTP 200 with `status: "miss"`.
 *
 * This is the single most consequential choice in the whole feature. Clay,
 * n8n, Make and Zapier all treat a non-2xx as a failure and will retry the row
 * or halt the table — so returning 404 for "no email found" would make the
 * flagship use case unusable. Only a genuine breakage is a non-2xx.
 */
function statusFor(result: RunResult): number {
  return result.status === "error" ? 502 : 200;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ endpointId: string }> }
) {
  const { endpointId } = await params;

  // --- Authenticate ----------------------------------------------------
  const presented = extractEndpointKey(req.headers);
  if (!presented) {
    return json(
      { error: "Send your endpoint key as the x-endpoint-key header" },
      401
    );
  }

  const auth = await authenticateEndpointKey(presented);
  // Unknown, revoked and wrong-secret are all the same answer — distinguishing
  // them would confirm which key ids exist.
  if (!auth) return json({ error: "Invalid endpoint key" }, 401);

  const { endpoint, keyRecordId } = auth;

  // The key identifies the endpoint; the URL segment only has to agree with it.
  // Checked explicitly rather than trusted, so a valid key for endpoint A can't
  // run endpoint B. Either the slug (what the dashboard advertises, and what
  // reads well in someone else's tool) or the id will do.
  if (endpoint.slug !== endpointId && endpoint.id !== endpointId) {
    return json({ error: "Invalid endpoint key" }, 401);
  }

  if (!endpoint.enabled) {
    return json({ error: "This endpoint is turned off" }, 503);
  }

  // --- Rate limit ------------------------------------------------------
  const rate = await consumeEndpointRate(keyRecordId, endpoint.rate_limit_per_minute);
  if (!rate.allowed) {
    return json(
      {
        error: `Rate limit reached — ${rate.limit} runs per minute for this key`,
        retry_after: rate.resetIn,
      },
      429,
      { "retry-after": String(rate.resetIn) }
    );
  }

  // --- Read the input --------------------------------------------------
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INPUT_BYTES) {
    return json({ error: "Input is too large" }, 413);
  }

  let payload: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_INPUT_BYTES) {
      return json({ error: "Input is too large" }, 413);
    }
    payload = text.trim() ? JSON.parse(text) : {};
  } catch {
    return json({ error: "Body must be valid JSON" }, 400);
  }

  const { definition, version } = await getActiveDefinition(endpoint);

  if ((definition.steps ?? []).length === 0) {
    return json({ error: "This endpoint has no steps yet" }, 409);
  }

  const input = validateRunInput(definition.inputs ?? [], payload);
  if (!input.ok) {
    return json({ error: "Check the input", details: input.errors }, 400);
  }

  // --- Run it ----------------------------------------------------------
  let result: RunResult;
  try {
    result = await executeEndpointRun({
      definition,
      input: input.value,
      deadlineMs: Math.min(endpoint.run_deadline_ms, HARD_DEADLINE_MS),
      includeBodies: endpoint.log_bodies,
    });
  } catch (err) {
    // Never surface the raw message: it can carry a target hostname or a
    // fragment of an upstream response.
    console.error("[run] unexpected failure", endpointId, err);
    return json({ error: "The run failed unexpectedly" }, 500);
  }

  void touchEndpointKey(keyRecordId).catch(() => {});

  return json(
    {
      status: result.status,
      output: result.output,
      raw: result.raw,
      resolved_by: result.resolved_by,
      missing: result.missing_outputs,
      error: result.error,
      meta: {
        endpoint: endpoint.slug,
        version: version?.version_no ?? null,
        duration_ms: result.duration_ms,
        upstream_calls: result.upstream_calls,
        cost_cents: result.cost_cents,
        cache_hit: false,
      },
      trace: result.steps,
    },
    statusFor(result)
  );
}

export async function GET() {
  return json(
    {
      error: "Use POST with a JSON body of this endpoint's inputs",
    },
    405,
    { allow: "POST" }
  );
}
