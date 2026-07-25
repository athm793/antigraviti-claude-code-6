import { v4 as uuidv4 } from "uuid";
import { getSQL, initSchema } from "./db";
import {
  generateEndpointKey,
  parseEndpointKey,
  verifySecret,
} from "./endpointKeys";
import {
  emptyDefinition,
  type Endpoint,
  type EndpointDefinition,
  type EndpointKeyIssued,
  type EndpointKeyRecord,
  type EndpointVersion,
  type EndpointWithStats,
} from "./endpointTypes";

type Row = Record<string, unknown>;

function toISO(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value as string).toISOString();
}

function toISOOrNull(value: unknown): string | null {
  return value ? toISO(value) : null;
}

function rowToEndpoint(row: Row): Endpoint {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string) ?? "",
    owner_user_id: (row.owner_user_id as string | null) ?? null,
    active_version_id: (row.active_version_id as string | null) ?? null,
    revision: row.revision as number,
    enabled: row.enabled as boolean,
    cache_enabled: row.cache_enabled as boolean,
    cache_ttl_seconds: row.cache_ttl_seconds as number,
    run_deadline_ms: row.run_deadline_ms as number,
    log_retention_days: row.log_retention_days as number,
    log_bodies: row.log_bodies as boolean,
    rate_limit_per_minute: (row.rate_limit_per_minute as number) ?? 60,
    created_at: toISO(row.created_at),
    updated_at: toISO(row.updated_at),
  };
}

function rowToVersion(row: Row): EndpointVersion {
  return {
    id: row.id as string,
    endpoint_id: row.endpoint_id as string,
    version_no: row.version_no as number,
    definition: row.definition as EndpointDefinition,
    note: (row.note as string | null) ?? null,
    created_at: toISO(row.created_at),
  };
}

function rowToKeyRecord(row: Row): EndpointKeyRecord {
  return {
    id: row.id as string,
    endpoint_id: row.endpoint_id as string,
    key_id: row.key_id as string,
    label: (row.label as string) ?? "",
    last_used_at: toISOOrNull(row.last_used_at),
    revoked_at: toISOOrNull(row.revoked_at),
    created_at: toISO(row.created_at),
  };
}

// Re-exported so server callers can keep importing them from here, while the
// rules themselves live in a module the browser can also import.
export { normalizeSlug, isValidSlug } from "./slug";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Scoped like providers: admins see everything, everyone else sees their own.
 * Run counts come from a 7-day window so the list can show a hit rate without
 * a second request.
 */
export async function listEndpoints(
  viewer: { id: string; is_admin: boolean } | null
): Promise<EndpointWithStats[]> {
  const sql = getSQL();
  await initSchema();
  const ownerFilter = viewer && !viewer.is_admin ? viewer.id : null;

  const rows = await sql`
    SELECT
      e.*,
      COALESCE(jsonb_array_length(v.definition -> 'steps'), 0)          AS step_count,
      COALESCE(r.runs, 0)::int                                          AS runs_7d,
      COALESCE(r.hits, 0)::int                                          AS hits_7d,
      EXISTS (
        SELECT 1 FROM endpoint_keys k
        WHERE k.endpoint_id = e.id AND k.revoked_at IS NULL
      )                                                                 AS has_key
    FROM endpoints e
    LEFT JOIN endpoint_versions v ON v.id = e.active_version_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS runs,
             -- Same definition of "answered" the endpoint's own Runs tab uses
             -- (success + partial). Counting only 'success' here meant the
             -- list and the detail page reported different percentages for
             -- the same endpoint and window, with nothing on either screen
             -- explaining the gap. A partial run did return data.
             COUNT(*) FILTER (WHERE status IN ('success', 'partial')) AS hits
      FROM endpoint_runs
      WHERE endpoint_id = e.id AND created_at > NOW() - INTERVAL '7 days'
    ) r ON true
    WHERE ${ownerFilter}::text IS NULL OR e.owner_user_id = ${ownerFilter}
    ORDER BY e.updated_at DESC
  `;

  return rows.map((raw) => {
    const row = raw as Row;
    const runs = (row.runs_7d as number) ?? 0;
    const hits = (row.hits_7d as number) ?? 0;
    return {
      ...rowToEndpoint(row),
      step_count: (row.step_count as number) ?? 0,
      runs_7d: runs,
      hits_7d: hits,
      // null rather than 0 when nothing has run — "no data yet" and "everything
      // missed" are very different and must not render identically.
      hit_rate_7d: runs > 0 ? hits / runs : null,
      has_key: Boolean(row.has_key),
    };
  });
}

export async function getEndpoint(id: string): Promise<Endpoint | null> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`SELECT * FROM endpoints WHERE id = ${id}`;
  return rows[0] ? rowToEndpoint(rows[0] as Row) : null;
}

export async function getEndpointBySlug(slug: string): Promise<Endpoint | null> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`SELECT * FROM endpoints WHERE slug = ${slug}`;
  return rows[0] ? rowToEndpoint(rows[0] as Row) : null;
}

export async function getVersion(versionId: string): Promise<EndpointVersion | null> {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM endpoint_versions WHERE id = ${versionId}`;
  return rows[0] ? rowToVersion(rows[0] as Row) : null;
}

/** The definition currently served, or an empty one for a brand-new endpoint. */
export async function getActiveDefinition(
  endpoint: Endpoint
): Promise<{ definition: EndpointDefinition; version: EndpointVersion | null }> {
  if (!endpoint.active_version_id) {
    return { definition: emptyDefinition(), version: null };
  }
  const version = await getVersion(endpoint.active_version_id);
  return {
    definition: version?.definition ?? emptyDefinition(),
    version,
  };
}

export async function listVersions(
  endpointId: string,
  limit = 20
): Promise<EndpointVersion[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM endpoint_versions
    WHERE endpoint_id = ${endpointId}
    ORDER BY version_no DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => rowToVersion(r as Row));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createEndpoint(data: {
  name: string;
  slug: string;
  description?: string;
  ownerUserId: string;
  definition?: EndpointDefinition;
}): Promise<{ endpoint: Endpoint; key: EndpointKeyIssued }> {
  const sql = getSQL();
  await initSchema();

  const id = uuidv4();
  const versionId = uuidv4();
  const definition = data.definition ?? emptyDefinition();

  const rows = await sql`
    INSERT INTO endpoints (id, name, slug, description, owner_user_id)
    VALUES (${id}, ${data.name}, ${data.slug}, ${data.description ?? ""}, ${data.ownerUserId})
    RETURNING *
  `;
  const endpoint = rowToEndpoint(rows[0] as Row);

  await sql`
    INSERT INTO endpoint_versions (id, endpoint_id, version_no, definition, note)
    VALUES (${versionId}, ${id}, 1, ${JSON.stringify(definition)}::jsonb, 'Created')
  `;
  await sql`UPDATE endpoints SET active_version_id = ${versionId} WHERE id = ${id}`;

  const key = await issueEndpointKey(id, "Default");

  return { endpoint: { ...endpoint, active_version_id: versionId }, key };
}

/**
 * Writes a new immutable version and points the endpoint at it.
 *
 * `expectedRevision` is an optimistic lock: two people editing the same
 * waterfall would otherwise silently overwrite each other, and the loser
 * wouldn't find out until a run behaved unexpectedly.
 */
export async function saveDefinition(
  endpointId: string,
  definition: EndpointDefinition,
  expectedRevision: number,
  note?: string
): Promise<
  | { ok: true; version: EndpointVersion; revision: number }
  | { ok: false; reason: "conflict"; revision: number }
  | { ok: false; reason: "not_found" }
> {
  const sql = getSQL();

  const bumped = await sql`
    UPDATE endpoints
    SET revision = revision + 1, updated_at = NOW()
    WHERE id = ${endpointId} AND revision = ${expectedRevision}
    RETURNING revision
  `;

  if (bumped.length === 0) {
    const current = await sql`SELECT revision FROM endpoints WHERE id = ${endpointId}`;
    if (current.length === 0) return { ok: false, reason: "not_found" };
    return {
      ok: false,
      reason: "conflict",
      revision: current[0].revision as number,
    };
  }

  const revision = bumped[0].revision as number;
  const versionId = uuidv4();

  /*
   * The version row and the pointer to it move together, or neither does.
   *
   * These were two separate statements after the revision bump had already
   * committed. A failure between them left the endpoint reporting a bumped
   * revision with no new version published — so the editor's cached revision
   * was permanently stale (every later save 409'd until a reload) while live
   * traffic quietly kept running the previous definition. Batching them means
   * a failure rolls both back, leaving only the revision bump, which the
   * caller's next attempt reconciles through the normal conflict path.
   */
  const [versionRows] = await sql.transaction([
    sql`
      INSERT INTO endpoint_versions (id, endpoint_id, version_no, definition, note)
      SELECT
        ${versionId},
        ${endpointId},
        COALESCE(MAX(version_no), 0) + 1,
        ${JSON.stringify(definition)}::jsonb,
        ${note ?? null}
      FROM endpoint_versions WHERE endpoint_id = ${endpointId}
      RETURNING *
    `,
    sql`
      UPDATE endpoints SET active_version_id = ${versionId}, updated_at = NOW()
      WHERE id = ${endpointId}
    `,
  ]);

  return {
    ok: true,
    version: rowToVersion((versionRows as Row[])[0] as Row),
    revision,
  };
}

export async function updateEndpointSettings(
  id: string,
  data: {
    name?: string;
    slug?: string;
    description?: string;
    enabled?: boolean;
    cache_enabled?: boolean;
    cache_ttl_seconds?: number;
    run_deadline_ms?: number;
    log_retention_days?: number;
    log_bodies?: boolean;
    rate_limit_per_minute?: number;
  }
): Promise<Endpoint | null> {
  const sql = getSQL();
  const existing = await getEndpoint(id);
  if (!existing) return null;

  const rows = await sql`
    UPDATE endpoints SET
      name               = ${data.name ?? existing.name},
      slug               = ${data.slug ?? existing.slug},
      description        = ${data.description ?? existing.description},
      enabled            = ${data.enabled ?? existing.enabled},
      cache_enabled      = ${data.cache_enabled ?? existing.cache_enabled},
      cache_ttl_seconds  = ${data.cache_ttl_seconds ?? existing.cache_ttl_seconds},
      run_deadline_ms    = ${data.run_deadline_ms ?? existing.run_deadline_ms},
      log_retention_days = ${data.log_retention_days ?? existing.log_retention_days},
      log_bodies         = ${data.log_bodies ?? existing.log_bodies},
      rate_limit_per_minute = ${data.rate_limit_per_minute ?? existing.rate_limit_per_minute},
      updated_at         = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ? rowToEndpoint(rows[0] as Row) : null;
}

export async function deleteEndpoint(id: string): Promise<void> {
  const sql = getSQL();
  await sql`DELETE FROM endpoints WHERE id = ${id}`;
}

/** Restores an old version by writing it forward as a new one. */
export async function restoreVersion(
  endpointId: string,
  versionId: string,
  expectedRevision: number
) {
  const version = await getVersion(versionId);
  if (!version || version.endpoint_id !== endpointId) {
    return { ok: false as const, reason: "not_found" as const };
  }
  return saveDefinition(
    endpointId,
    version.definition,
    expectedRevision,
    `Restored from v${version.version_no}`
  );
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export async function issueEndpointKey(
  endpointId: string,
  label: string
): Promise<EndpointKeyIssued> {
  const sql = getSQL();
  const generated = generateEndpointKey();
  const id = uuidv4();

  const rows = await sql`
    INSERT INTO endpoint_keys (id, endpoint_id, key_id, key_hash, label)
    VALUES (${id}, ${endpointId}, ${generated.keyId}, ${generated.hash}, ${label})
    RETURNING *
  `;
  const row = rows[0] as Row;

  return {
    id: row.id as string,
    key_id: generated.keyId,
    plaintext: generated.plaintext,
    created_at: toISO(row.created_at),
  };
}

export async function listEndpointKeys(endpointId: string): Promise<EndpointKeyRecord[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM endpoint_keys
    WHERE endpoint_id = ${endpointId}
    ORDER BY created_at DESC
  `;
  return rows.map((r) => rowToKeyRecord(r as Row));
}

export async function revokeEndpointKey(
  endpointId: string,
  keyRecordId: string
): Promise<boolean> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE endpoint_keys SET revoked_at = NOW()
    WHERE id = ${keyRecordId} AND endpoint_id = ${endpointId} AND revoked_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Authenticates a presented key.
 *
 * Looks up by the public key id, then compares hashes in constant time.
 * Returns null for unknown, revoked, or mismatched keys without
 * distinguishing between them.
 */
export async function authenticateEndpointKey(
  raw: string
): Promise<{ endpoint: Endpoint; keyRecordId: string } | null> {
  const parsed = parseEndpointKey(raw);
  if (!parsed) return null;

  const sql = getSQL();
  await initSchema();

  const rows = await sql`
    SELECT k.id AS key_record_id, k.key_hash, k.revoked_at, e.*
    FROM endpoint_keys k
    JOIN endpoints e ON e.id = k.endpoint_id
    WHERE k.key_id = ${parsed.keyId}
  `;
  if (rows.length === 0) return null;

  const row = rows[0] as Row;
  if (row.revoked_at) return null;
  if (!verifySecret(parsed.secret, row.key_hash as string)) return null;

  return {
    endpoint: rowToEndpoint(row),
    keyRecordId: row.key_record_id as string,
  };
}

/** Fire-and-forget from the run path — never block a request on this. */
export async function touchEndpointKey(keyRecordId: string): Promise<void> {
  const sql = getSQL();
  await sql`UPDATE endpoint_keys SET last_used_at = NOW() WHERE id = ${keyRecordId}`;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

export interface RateVerdict {
  allowed: boolean;
  used: number;
  limit: number;
  /** Seconds until the current minute rolls over. Feeds Retry-After. */
  resetIn: number;
}

/**
 * Counts a run against its key's per-minute allowance.
 *
 * Deliberately a database counter rather than the in-memory limiter used
 * elsewhere: that one is per serverless instance and keyed on the caller's
 * claimed IP, so it neither adds up across instances nor resists spoofing.
 * Here every request spends real money at real vendors, so the count has to be
 * shared and tied to the key, not the network path.
 *
 * The increment is a single atomic upsert — two concurrent requests can't both
 * read "59" and both proceed.
 */
export async function consumeEndpointRate(
  keyRecordId: string,
  limitPerMinute: number
): Promise<RateVerdict> {
  const now = new Date();
  const resetIn = 60 - now.getUTCSeconds();

  if (limitPerMinute <= 0) {
    return { allowed: true, used: 0, limit: 0, resetIn };
  }

  const sql = getSQL();
  const rows = await sql`
    INSERT INTO endpoint_rate_counters (key_record_id, window_start, count)
    VALUES (${keyRecordId}, date_trunc('minute', NOW()), 1)
    ON CONFLICT (key_record_id, window_start)
    DO UPDATE SET count = endpoint_rate_counters.count + 1
    RETURNING count
  `;
  const used = (rows[0]?.count as number) ?? 1;

  // Only when this key opens a fresh minute, so the sweep is rare and never
  // needs a cron of its own.
  if (used === 1) {
    void sql`
      DELETE FROM endpoint_rate_counters WHERE window_start < NOW() - INTERVAL '10 minutes'
    `.catch(() => {});
  }

  return { allowed: used <= limitPerMinute, used, limit: limitPerMinute, resetIn };
}

// ---------------------------------------------------------------------------
// Provider references
// ---------------------------------------------------------------------------

/**
 * Which live endpoints reference a given provider.
 *
 * The definition is JSONB with no foreign key, so this is what stands in for
 * one — it powers the delete guard and the "used by" list on a provider.
 */
export async function endpointsUsingConfig(
  configId: string
): Promise<{ id: string; name: string }[]> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`
    SELECT DISTINCT e.id, e.name
    FROM endpoints e
    JOIN endpoint_versions v ON v.id = e.active_version_id
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(v.definition -> 'steps', '[]'::jsonb)
    ) AS step
    WHERE step ->> 'config_id' = ${configId}
    ORDER BY e.name
  `;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string }));
}

export async function countEndpointsPerConfig(): Promise<Record<string, number>> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`
    SELECT step ->> 'config_id' AS config_id, COUNT(DISTINCT e.id)::int AS n
    FROM endpoints e
    JOIN endpoint_versions v ON v.id = e.active_version_id
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(v.definition -> 'steps', '[]'::jsonb)
    ) AS step
    WHERE step ->> 'config_id' IS NOT NULL
    GROUP BY 1
  `;
  const out: Record<string, number> = {};
  for (const row of rows) {
    out[row.config_id as string] = row.n as number;
  }
  return out;
}
