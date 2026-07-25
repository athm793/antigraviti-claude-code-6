import { createHash } from "crypto";
import { getSQL } from "./db";
import { cacheKeyMaterial } from "./engine/cacheKey";
import type { EndpointSettings } from "./endpointTypes";
import type { RunResult } from "./engine/execute";

/**
 * Result caching.
 *
 * The point is money, not latency: a repeated lookup that would call three
 * paid vendors again returns the answer already bought.
 */

export interface CachedRun {
  output: Record<string, unknown>;
  raw: unknown;
  resolved_by: string | null;
  status: RunResult["status"];
  missing_outputs: string[];
}

export function cacheKeyFor(parts: {
  ownerId: string | null;
  endpointId: string;
  versionId: string | null;
  input: Record<string, unknown>;
  settings?: Partial<EndpointSettings>;
}): string {
  return createHash("sha256").update(cacheKeyMaterial(parts)).digest("hex");
}

/**
 * Reads a cached result and counts the hit.
 *
 * Expiry is filtered in SQL rather than compared in JS, so a row that expired
 * a second ago can't be served because two machines disagree about the time.
 */
export async function readCache(cacheKey: string): Promise<CachedRun | null> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE endpoint_cache
    SET hit_count = hit_count + 1
    WHERE cache_key = ${cacheKey} AND expires_at > NOW()
    RETURNING result
  `;
  if (rows.length === 0) return null;
  return rows[0].result as CachedRun;
}

/**
 * Stores a result.
 *
 * Only outcomes worth repeating are cached. An `error` is a transient
 * condition — a provider that was down, a run that ran out of time — and
 * caching it would keep serving that failure long after it cleared. A `miss`
 * is deliberately *not* cached either: "nobody had this yesterday" shouldn't
 * stop you asking again today, since these datasets are exactly what vendors
 * keep adding to.
 */
export async function writeCache(
  cacheKey: string,
  endpointId: string,
  versionId: string | null,
  runId: string,
  result: RunResult,
  ttlSeconds: number
): Promise<void> {
  if (ttlSeconds <= 0) return;
  if (result.status !== "success" && result.status !== "partial") return;

  const payload: CachedRun = {
    output: result.output,
    raw: result.raw,
    resolved_by: result.resolved_by,
    status: result.status,
    missing_outputs: result.missing_outputs,
  };

  const sql = getSQL();
  await sql`
    INSERT INTO endpoint_cache (cache_key, endpoint_id, version_id, result, run_id, expires_at)
    VALUES (
      ${cacheKey}, ${endpointId}, ${versionId},
      ${JSON.stringify(payload)}::jsonb, ${runId},
      NOW() + (${ttlSeconds} * INTERVAL '1 second')
    )
    ON CONFLICT (cache_key) DO UPDATE SET
      result     = EXCLUDED.result,
      version_id = EXCLUDED.version_id,
      run_id     = EXCLUDED.run_id,
      expires_at = EXCLUDED.expires_at
  `;
}

/** Used by the settings screen's "clear cache" action. */
export async function purgeCache(endpointId: string): Promise<number> {
  const sql = getSQL();
  const rows = await sql`
    DELETE FROM endpoint_cache WHERE endpoint_id = ${endpointId} RETURNING cache_key
  `;
  return rows.length;
}

export async function countCache(endpointId: string): Promise<number> {
  const sql = getSQL();
  const rows = await sql`
    SELECT COUNT(*)::int AS n FROM endpoint_cache
    WHERE endpoint_id = ${endpointId} AND expires_at > NOW()
  `;
  return (rows[0]?.n as number) ?? 0;
}
