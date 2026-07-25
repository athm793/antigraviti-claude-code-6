import { after } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { extractEndpointKey } from "@/lib/endpointKeys";
import {
  authenticateEndpointKey,
  consumeEndpointRate,
  getActiveDefinition,
  touchEndpointKey,
} from "@/lib/endpointsDb";
import { validateRunInput } from "@/lib/engine/input";
import { executeEndpointRun, HARD_DEADLINE_MS } from "@/lib/runner";
import { cacheKeyFor, readCache, writeCache } from "@/lib/runCache";
import { persistRun } from "@/lib/runLog";
import { logEvent } from "@/lib/log";
import type { RunResult } from "@/lib/engine/execute";

/**
 * The record written when the executor itself threw.
 *
 * Deliberately carries no detail beyond "it failed": the thrown message can
 * contain a target hostname or a fragment of an upstream body, and this row
 * is readable in the dashboard.
 */
function failedRunResult(runId: string): RunResult {
  void runId;
  return {
    status: "error",
    output: {},
    raw: null,
    resolved_by: null,
    steps: [],
    duration_ms: 0,
    cost_cents: 0,
    upstream_calls: 0,
    missing_outputs: [],
    error: "The run failed unexpectedly",
  };
}

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

  // --- Cache -----------------------------------------------------------
  //
  // The version id is part of the key, which *is* the invalidation story: edit
  // a step and every answer bought under the old definition goes cold on its
  // own. The owner is in it so one tenant's enriched contact can never be
  // served to another.
  const runId = uuidv4();
  const started = Date.now();
  const cacheKey = endpoint.cache_enabled
    ? cacheKeyFor({
        ownerId: endpoint.owner_user_id,
        endpointId: endpoint.id,
        versionId: version?.id ?? null,
        input: input.value,
        settings: definition.settings,
      })
    : null;

  if (cacheKey) {
    const cached = await readCache(cacheKey).catch(() => null);
    if (cached) {
      const meta = {
        endpoint: endpoint.slug,
        version: version?.version_no ?? null,
        duration_ms: Date.now() - started,
        upstream_calls: 0,
        cost_cents: 0,
        cache_hit: true,
        // A cache hit is still a logged run under this id, so a caller that
        // records meta.run_id to reopen it later must get one here too.
        // Omitting it broke correlation on exactly the cheap requests an
        // automation makes most of.
        run_id: runId,
      };
      after(async () => {
        try {
          await persistRun({
            runId,
            endpoint,
            versionId: version?.id ?? null,
            input: input.value,
            cacheHit: true,
            result: {
              status: cached.status,
              output: cached.output,
              raw: cached.raw,
              resolved_by: cached.resolved_by,
              steps: [],
              duration_ms: meta.duration_ms,
              cost_cents: 0,
              upstream_calls: 0,
              missing_outputs: cached.missing_outputs,
              error: null,
            },
          });
          // A cache-served request still used the key, so its last-used
          // stamp must move — otherwise a key serving nothing but cache hits
          // looks dormant and could be revoked as unused.
          await touchEndpointKey(keyRecordId);
        } catch (err) {
          console.error("[run] could not log cache hit", runId, err);
        }
      });

      return json(
        {
          status: cached.status,
          output: cached.output,
          raw: cached.raw,
          resolved_by: cached.resolved_by,
          missing: cached.missing_outputs,
          error: null,
          meta,
          trace: [],
        },
        200
      );
    }
  }

  // --- Run it ----------------------------------------------------------
  let result: RunResult;
  try {
    result = await executeEndpointRun({
      runId,
      definition,
      input: input.value,
      deadlineMs: Math.min(endpoint.run_deadline_ms, HARD_DEADLINE_MS),
      includeBodies: endpoint.log_bodies,
    });
  } catch (err) {
    // Never surface the raw message: it can carry a target hostname or a
    // fragment of an upstream response.
    console.error("[run] unexpected failure", endpointId, err);
    logEvent("error", "run_failed", {
      endpoint: endpoint.slug,
      run_id: runId,
      reason: "executor_threw",
    });
    // Log the runs that blew up, not just the ones that worked.
    //
    // Returning here without persisting meant the failures were invisible in
    // run history, so hit rates and spend were computed over a sample biased
    // towards success — exactly the runs an operator least needs to inspect
    // were the ones with no record.
    after(async () => {
      try {
        await persistRun({
          runId,
          endpoint,
          versionId: version?.id ?? null,
          input: input.value,
          cacheHit: false,
          result: failedRunResult(runId),
        });
      } catch (logErr) {
        console.error("[run] could not record failed run", runId, logErr);
      }
    });
    return json({ error: "The run failed unexpectedly" }, 500);
  }

  // Logging and caching happen after the response is sent, so they cost the
  // caller nothing — this is a request they are waiting on to enrich a row.
  after(async () => {
    // Independent, not chained.
    //
    // These three were awaited in sequence inside one try, so a persistRun
    // failure — the likeliest of the three, since it writes a batched
    // multi-row transaction — silently skipped the cache write, throwing away
    // a result that had already been paid for and making the next identical
    // request re-buy it. They share nothing; settle them separately.
    const outcomes = await Promise.allSettled([
      persistRun({
        runId,
        endpoint,
        versionId: version?.id ?? null,
        input: input.value,
        cacheHit: false,
        result,
      }),
      cacheKey
        ? writeCache(
            cacheKey,
            endpoint.id,
            version?.id ?? null,
            runId,
            result,
            endpoint.cache_ttl_seconds
          )
        : Promise.resolve(),
      touchEndpointKey(keyRecordId),
    ]);

    // A failed log must never turn a successful run into an error for the
    // caller — they already have their answer.
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        console.error("[run] could not record run", runId, outcome.reason);
      }
    }
  });

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
        run_id: runId,
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
