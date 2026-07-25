import { getSQL } from "./db";
import type { RunStatus } from "./engine/execute";

/**
 * Which vendor is actually earning its keep.
 *
 * The framing matters more than the SQL here. A later provider in a waterfall
 * only ever sees the cases everyone before it missed, so its raw success rate
 * is measured against a harder set of inputs than the first provider's. Two
 * numbers are reported per step and neither is complete on its own:
 *
 *   hit rate            — of the runs where this step actually ran, how often
 *                         did it answer. Comparable within a step over time.
 *   share of resolutions— of all the runs that got an answer, how often was it
 *                         this step. This is the "would I miss it if I dropped
 *                         it" number.
 *
 * A single "success rate" column would read as if the steps were comparable,
 * and they are not. The UI says so in a callout rather than leaving someone to
 * cancel a vendor on a misread number.
 */

export interface StepAnalytics {
  step_key: string;
  step_index: number;
  name: string;
  config_id: string | null;
  times_ran: number;
  times_answered: number;
  times_skipped: number;
  times_errored: number;
  /** null when the step never ran — not the same as 0%. */
  hit_rate: number | null;
  resolutions: number;
  share_of_resolutions: number | null;
  avg_latency_ms: number;
  cost_cents: number;
  /** Cost per answer, the number that decides whether a vendor stays. */
  cost_per_resolution_cents: number | null;
}

export interface EndpointAnalytics {
  days: number;
  runs: number;
  by_status: Record<RunStatus, number>;
  resolved: number;
  cache_hits: number;
  avg_duration_ms: number;
  total_cost_cents: number;
  upstream_calls: number;
  steps: StepAnalytics[];
}

const EMPTY_STATUS: Record<RunStatus, number> = {
  success: 0,
  partial: 0,
  miss: 0,
  error: 0,
};

export async function getEndpointAnalytics(
  endpointId: string,
  days = 30
): Promise<EndpointAnalytics> {
  const sql = getSQL();

  const [totals, statuses, steps] = await Promise.all([
    sql`
      SELECT COUNT(*)::int                                   AS runs,
             COUNT(*) FILTER (WHERE cache_hit)::int          AS cache_hits,
             COALESCE(AVG(duration_ms), 0)::int              AS avg_duration_ms,
             COALESCE(SUM(cost_cents), 0)::int               AS total_cost_cents,
             COALESCE(SUM(upstream_calls), 0)::int           AS upstream_calls,
             COUNT(*) FILTER (WHERE resolved_by IS NOT NULL)::int AS resolved
      FROM endpoint_runs
      WHERE endpoint_id = ${endpointId}
        AND created_at > NOW() - (${days} * INTERVAL '1 day')
    `,
    sql`
      SELECT status, COUNT(*)::int AS n
      FROM endpoint_runs
      WHERE endpoint_id = ${endpointId}
        AND created_at > NOW() - (${days} * INTERVAL '1 day')
      GROUP BY status
    `,
    sql`
      SELECT s.step_key,
             MIN(s.step_index)::int                                    AS step_index,
             -- The step's name at the time, not today's: a renamed step
             -- shouldn't rewrite its own history.
             (ARRAY_AGG(s.config_name ORDER BY s.created_at DESC))[1]   AS config_name,
             (ARRAY_AGG(s.config_id   ORDER BY s.created_at DESC))[1]   AS config_id,
             COUNT(*) FILTER (WHERE s.status IN ('success','miss','error'))::int AS times_ran,
             COUNT(*) FILTER (WHERE s.status = 'success')::int          AS times_answered,
             COUNT(*) FILTER (WHERE s.status = 'skipped')::int          AS times_skipped,
             COUNT(*) FILTER (WHERE s.status IN ('error','config_missing'))::int AS times_errored,
             COUNT(*) FILTER (WHERE r.resolved_by = s.step_key)::int    AS resolutions,
             COALESCE(AVG(s.latency_ms) FILTER (WHERE s.latency_ms > 0), 0)::int AS avg_latency_ms,
             COALESCE(SUM(s.cost_cents), 0)::int                        AS cost_cents
      FROM endpoint_run_steps s
      JOIN endpoint_runs r ON r.id = s.run_id
      WHERE r.endpoint_id = ${endpointId}
        AND r.created_at > NOW() - (${days} * INTERVAL '1 day')
      GROUP BY s.step_key
      ORDER BY 2
    `,
  ]);

  const by_status = { ...EMPTY_STATUS };
  for (const row of statuses) {
    const key = row.status as RunStatus;
    if (key in by_status) by_status[key] = row.n as number;
  }

  const t = totals[0] ?? {};
  const resolved = (t.resolved as number) ?? 0;

  return {
    days,
    runs: (t.runs as number) ?? 0,
    by_status,
    resolved,
    cache_hits: (t.cache_hits as number) ?? 0,
    avg_duration_ms: (t.avg_duration_ms as number) ?? 0,
    total_cost_cents: (t.total_cost_cents as number) ?? 0,
    upstream_calls: (t.upstream_calls as number) ?? 0,
    steps: steps.map((raw) => {
      const row = raw as Record<string, unknown>;
      const ran = (row.times_ran as number) ?? 0;
      const answered = (row.times_answered as number) ?? 0;
      const resolutions = (row.resolutions as number) ?? 0;
      const cost = (row.cost_cents as number) ?? 0;
      return {
        step_key: row.step_key as string,
        step_index: (row.step_index as number) ?? 0,
        name: (row.config_name as string) ?? (row.step_key as string),
        config_id: (row.config_id as string | null) ?? null,
        times_ran: ran,
        times_answered: answered,
        times_skipped: (row.times_skipped as number) ?? 0,
        times_errored: (row.times_errored as number) ?? 0,
        // null, not 0. "Never ran" and "ran and never answered" are opposite
        // conclusions about a vendor and must not render identically.
        hit_rate: ran > 0 ? answered / ran : null,
        resolutions,
        share_of_resolutions: resolved > 0 ? resolutions / resolved : null,
        avg_latency_ms: (row.avg_latency_ms as number) ?? 0,
        cost_cents: cost,
        cost_per_resolution_cents: resolutions > 0 ? cost / resolutions : null,
      };
    }),
  };
}

/**
 * Deletes aged run history and expired cache rows.
 *
 * Retention is per endpoint, so this can't be a single blanket DELETE — an
 * endpoint set to keep 7 days and one set to keep a year are both correct.
 */
export async function pruneOldData(): Promise<{
  runs: number;
  cache: number;
  rateCounters: number;
}> {
  const sql = getSQL();

  const runs = await sql`
    DELETE FROM endpoint_runs r
    USING endpoints e
    WHERE r.endpoint_id = e.id
      AND r.created_at < NOW() - (e.log_retention_days * INTERVAL '1 day')
    RETURNING r.id
  `;
  const cache = await sql`
    DELETE FROM endpoint_cache WHERE expires_at < NOW() RETURNING cache_key
  `;
  const rate = await sql`
    DELETE FROM endpoint_rate_counters
    WHERE window_start < NOW() - INTERVAL '1 hour'
    RETURNING key_record_id
  `;

  // Step rows go with their run via ON DELETE CASCADE.
  return { runs: runs.length, cache: cache.length, rateCounters: rate.length };
}
