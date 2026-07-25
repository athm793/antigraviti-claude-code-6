import { getSQL } from "./db";
import type { RunResult, StepTrace } from "./engine/execute";
import type { Endpoint } from "./endpointTypes";

/**
 * Run history.
 *
 * Written by allowlist, never by dumping the run object: ids, statuses,
 * timings, counts and the condition trace. Bodies only when the endpoint opts
 * in. This is contact-enrichment traffic — names, emails, phone numbers — so
 * logging everything by default would quietly turn a credentials product into
 * a PII store, and the retention setting can only limit how long that lasts,
 * not whether it happened.
 */

export interface RunLogRow {
  id: string;
  endpoint_id: string;
  version_id: string | null;
  status: RunResult["status"];
  resolved_by: string | null;
  resolved_by_name: string | null;
  cache_hit: boolean;
  upstream_calls: number;
  cost_cents: number;
  duration_ms: number;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  step_count: number;
}

export interface RunStepRow {
  step_key: string;
  step_index: number;
  group_id: string | null;
  config_id: string | null;
  config_name: string | null;
  status: StepTrace["status"];
  skip_reason: string | null;
  http_status: number | null;
  latency_ms: number;
  attempts: number;
  keys_exhausted: number;
  cost_cents: number;
  trace: {
    run_condition: StepTrace["run_condition"];
    success_condition: StepTrace["success_condition"];
    unresolved: string[];
    output_fields: string[];
    error: StepTrace["error"];
    request: StepTrace["request"];
    response_preview: string | null;
  } | null;
}

/** Keeps one chatty provider from making the log table the biggest thing here. */
const MAX_INPUT_CHARS = 4_000;

function cap(value: unknown, limit: number): unknown {
  if (value === null || value === undefined) return null;
  const text = JSON.stringify(value) ?? "null";
  if (text.length <= limit) return value;
  return { _truncated: true, _bytes: text.length };
}

/**
 * Writes a run and its steps.
 *
 * One batched transaction, because the Neon HTTP driver has no interactive
 * ones — a run header with no step rows would show as a run that did nothing.
 * Called from `after()`, so a slow write costs the caller nothing.
 */
export async function persistRun(options: {
  runId: string;
  endpoint: Endpoint;
  versionId: string | null;
  result: RunResult;
  input: Record<string, unknown>;
  cacheHit: boolean;
}): Promise<void> {
  const { result, endpoint } = options;
  const sql = getSQL();

  const statements = [
    sql`
      INSERT INTO endpoint_runs (
        id, endpoint_id, version_id, status, resolved_by, cache_hit,
        upstream_calls, cost_cents, duration_ms, input, output, error
      ) VALUES (
        ${options.runId}, ${endpoint.id}, ${options.versionId}, ${result.status},
        ${result.resolved_by}, ${options.cacheHit},
        ${result.upstream_calls}, ${result.cost_cents}, ${result.duration_ms},
        ${JSON.stringify(cap(options.input, MAX_INPUT_CHARS))}::jsonb,
        ${
          // The output is the enrichment result itself — the most sensitive
          // part of the whole run. Kept only when the endpoint asked for it.
          endpoint.log_bodies
            ? JSON.stringify(cap(result.output, MAX_INPUT_CHARS))
            : null
        }::jsonb,
        ${result.error}
      )
      ON CONFLICT (id) DO NOTHING
    `,
    ...result.steps.map(
      (step) => sql`
        INSERT INTO endpoint_run_steps (
          run_id, step_key, step_index, group_id, config_id, config_name,
          status, skip_reason, http_status, latency_ms, attempts,
          keys_exhausted, cost_cents, trace
        ) VALUES (
          ${options.runId}, ${step.key}, ${step.index}, ${step.group},
          ${step.config_id || null}, ${step.config_name},
          ${step.status}, ${step.skip_reason}, ${step.http_status},
          ${step.latency_ms}, ${step.attempts}, ${step.keys_exhausted},
          ${step.cost_cents},
          ${JSON.stringify({
            run_condition: step.run_condition,
            success_condition: step.success_condition,
            unresolved: step.unresolved,
            output_fields: Object.keys(step.output),
            error: step.error,
            // Already gated on log_bodies upstream: the executor only fills
            // these when the caller asked for them.
            request: step.request,
            response_preview: step.response_preview,
          })}::jsonb
        )
      `
    ),
  ];

  await sql.transaction(statements);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function toISO(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(value as string).toISOString();
}

export async function listRuns(
  endpointId: string,
  options: { limit: number; offset: number; status?: string }
): Promise<{ rows: RunLogRow[]; total: number }> {
  const sql = getSQL();
  const status = options.status && options.status !== "all" ? options.status : null;

  const [rows, counted] = await Promise.all([
    sql`
      SELECT r.*,
             (SELECT COUNT(*) FROM endpoint_run_steps s WHERE s.run_id = r.id)::int AS step_count,
             (SELECT s.config_name FROM endpoint_run_steps s
               WHERE s.run_id = r.id AND s.step_key = r.resolved_by LIMIT 1)      AS resolved_by_name
      FROM endpoint_runs r
      WHERE r.endpoint_id = ${endpointId}
        AND (${status}::text IS NULL OR r.status = ${status})
      ORDER BY r.created_at DESC
      LIMIT ${options.limit} OFFSET ${options.offset}
    `,
    sql`
      SELECT COUNT(*)::int AS n FROM endpoint_runs
      WHERE endpoint_id = ${endpointId}
        AND (${status}::text IS NULL OR status = ${status})
    `,
  ]);

  return {
    rows: rows.map((raw) => {
      const row = raw as Row;
      return {
        id: row.id as string,
        endpoint_id: row.endpoint_id as string,
        version_id: (row.version_id as string | null) ?? null,
        status: row.status as RunResult["status"],
        resolved_by: (row.resolved_by as string | null) ?? null,
        resolved_by_name: (row.resolved_by_name as string | null) ?? null,
        cache_hit: Boolean(row.cache_hit),
        upstream_calls: (row.upstream_calls as number) ?? 0,
        cost_cents: (row.cost_cents as number) ?? 0,
        duration_ms: (row.duration_ms as number) ?? 0,
        input: (row.input as Record<string, unknown> | null) ?? null,
        output: (row.output as Record<string, unknown> | null) ?? null,
        error: (row.error as string | null) ?? null,
        created_at: toISO(row.created_at),
        step_count: (row.step_count as number) ?? 0,
      };
    }),
    total: (counted[0]?.n as number) ?? 0,
  };
}

export async function getRun(
  endpointId: string,
  runId: string
): Promise<{ run: RunLogRow; steps: RunStepRow[] } | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT r.*,
           (SELECT COUNT(*) FROM endpoint_run_steps s WHERE s.run_id = r.id)::int AS step_count,
           (SELECT s.config_name FROM endpoint_run_steps s
             WHERE s.run_id = r.id AND s.step_key = r.resolved_by LIMIT 1)        AS resolved_by_name
    FROM endpoint_runs r
    WHERE r.id = ${runId} AND r.endpoint_id = ${endpointId}
  `;
  if (rows.length === 0) return null;

  const stepRows = await sql`
    SELECT * FROM endpoint_run_steps WHERE run_id = ${runId} ORDER BY step_index
  `;

  const row = rows[0] as Row;
  return {
    run: {
      id: row.id as string,
      endpoint_id: row.endpoint_id as string,
      version_id: (row.version_id as string | null) ?? null,
      status: row.status as RunResult["status"],
      resolved_by: (row.resolved_by as string | null) ?? null,
      resolved_by_name: (row.resolved_by_name as string | null) ?? null,
      cache_hit: Boolean(row.cache_hit),
      upstream_calls: (row.upstream_calls as number) ?? 0,
      cost_cents: (row.cost_cents as number) ?? 0,
      duration_ms: (row.duration_ms as number) ?? 0,
      input: (row.input as Record<string, unknown> | null) ?? null,
      output: (row.output as Record<string, unknown> | null) ?? null,
      error: (row.error as string | null) ?? null,
      created_at: toISO(row.created_at),
      step_count: (row.step_count as number) ?? 0,
    },
    steps: stepRows.map((raw) => {
      const s = raw as Row;
      return {
        step_key: s.step_key as string,
        step_index: s.step_index as number,
        group_id: (s.group_id as string | null) ?? null,
        config_id: (s.config_id as string | null) ?? null,
        config_name: (s.config_name as string | null) ?? null,
        status: s.status as StepTrace["status"],
        skip_reason: (s.skip_reason as string | null) ?? null,
        http_status: (s.http_status as number | null) ?? null,
        latency_ms: (s.latency_ms as number) ?? 0,
        attempts: (s.attempts as number) ?? 0,
        keys_exhausted: (s.keys_exhausted as number) ?? 0,
        cost_cents: (s.cost_cents as number) ?? 0,
        trace: (s.trace as RunStepRow["trace"]) ?? null,
      };
    }),
  };
}
