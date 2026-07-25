import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { v4 as uuidv4 } from "uuid";
import { ENDPOINT_DDL } from "./endpointSchema.sql";
import type {
  ProxyConfig,
  ApiKey,
  ApiKeyView,
  KeyStats,
  ConfigWithStats,
  CreateConfigInput,
  UpdateConfigInput,
  InsertKeysResult,
  AuditLogEntry,
} from "./types";

export function getSQL(): NeonQueryFunction<false, false> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return neon(process.env.DATABASE_URL);
}

// Cached per warm serverless instance so we don't run the DDL on every
// request — schema only needs to be ensured once per cold start.
let schemaInitialized = false;
/**
 * The in-flight init, so N concurrent requests arriving on one cold instance
 * share a single run instead of each firing the whole DDL. A boolean alone
 * only closes the window *after* the first init resolves.
 */
let schemaInitInFlight: Promise<void> | null = null;

export async function initSchema(): Promise<void> {
  if (schemaInitialized) return;
  if (schemaInitInFlight) return schemaInitInFlight;
  schemaInitInFlight = runInitSchema()
    .then(() => {
      schemaInitialized = true;
    })
    .finally(() => {
      schemaInitInFlight = null;
    });
  return schemaInitInFlight;
}

async function runInitSchema(): Promise<void> {
  const sql = getSQL();
  /*
   * Serialize the whole init, not just half of it.
   *
   * CREATE TABLE IF NOT EXISTS is not race-free in Postgres — two concurrent
   * cold starts can collide with a duplicate-key error on the system
   * catalogue. The endpoint DDL has always been protected by this advisory
   * lock; the core tables below were not, despite carrying exactly the same
   * hazard. Taking the lock here covers both halves.
   *
   * This is a session-level lock rather than the xact-level one used inside
   * the batched endpoint transaction, because these statements are sent
   * individually. It is released explicitly in the finally block.
   */
  await sql`SELECT pg_advisory_lock(hashtext('keyproxy_schema'))`;
  try {
    await initCoreSchema(sql);
    await initEndpointSchema(sql);
  } finally {
    await sql`SELECT pg_advisory_unlock(hashtext('keyproxy_schema'))`;
  }
}

async function initCoreSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  // users is created first because proxy_configs.owner_user_id references it.
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT        PRIMARY KEY,
      email         TEXT        UNIQUE NOT NULL,
      password_hash TEXT        NOT NULL,
      name          TEXT        NOT NULL DEFAULT '',
      is_admin      BOOLEAN     NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS proxy_configs (
      id               TEXT        PRIMARY KEY,
      name             TEXT        NOT NULL,
      target_base_url  TEXT        NOT NULL,
      auth_header_name TEXT        NOT NULL DEFAULT 'Authorization',
      auth_header_prefix TEXT      NOT NULL DEFAULT 'Bearer ',
      rate_limit_codes INTEGER[]   NOT NULL DEFAULT '{429}',
      cooldown_minutes INTEGER     NOT NULL DEFAULT 0,
      master_key       TEXT        NOT NULL UNIQUE,
      owner_user_id    TEXT        REFERENCES users(id) ON DELETE SET NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id            SERIAL      PRIMARY KEY,
      config_id     TEXT        NOT NULL REFERENCES proxy_configs(id) ON DELETE CASCADE,
      key_value     TEXT        NOT NULL,
      order_index   INTEGER     NOT NULL,
      status        TEXT        NOT NULL DEFAULT 'active',
      exhausted_at  TIMESTAMPTZ,
      request_count INTEGER     NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_config_status ON api_keys(config_id, status, order_index)`;
  // The "duplicates skipped" promise needs an actual constraint behind it —
  // insertKeys relies on this index for its ON CONFLICT. Deduplicate any rows
  // an earlier build already let through, keeping the lowest id, before the
  // unique index can be created.
  await sql`
    DELETE FROM api_keys a
    USING api_keys b
    WHERE a.config_id = b.config_id
      AND a.key_value = b.key_value
      AND a.id > b.id
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_config_value ON api_keys(config_id, key_value)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_proxy_configs_master_key ON proxy_configs(master_key)`;
  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id         SERIAL      PRIMARY KEY,
      config_id  TEXT        NOT NULL REFERENCES proxy_configs(id) ON DELETE CASCADE,
      action     TEXT        NOT NULL,
      detail     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_config_created ON audit_log(config_id, created_at DESC)`;

  await sql`ALTER TABLE proxy_configs ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL`;
  /*
   * One-time adoption of pre-ownership configs, and only that.
   *
   * This used to run unconditionally on every cold start, which quietly
   * turned a migration into a policy: deleting a user NULLs their configs'
   * owner (ON DELETE SET NULL), so the next cold start handed those key pools
   * to the oldest admin. That is not an access escalation — admins can reach
   * every config anyway — but it silently rewrites ownership records forever
   * and re-scans the table on every cold start.
   *
   * The marker row makes it what it claims to be: a migration that has run.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const adoption = await sql`
    INSERT INTO schema_migrations (name) VALUES ('adopt_ownerless_configs')
    ON CONFLICT (name) DO NOTHING
    RETURNING name
  `;
  if (adoption.length > 0) {
    await sql`
      UPDATE proxy_configs SET owner_user_id = (
        SELECT id FROM users WHERE is_admin = true ORDER BY created_at ASC LIMIT 1
      )
      WHERE owner_user_id IS NULL
    `;
  }
  await sql`CREATE INDEX IF NOT EXISTS idx_proxy_configs_owner ON proxy_configs(owner_user_id)`;

  // Optional exhaustion webhook: where to POST when every key in the pool is
  // simultaneously exhausted, and when we last did (the debounce marker).
  await sql`ALTER TABLE proxy_configs ADD COLUMN IF NOT EXISTS webhook_url TEXT`;
  await sql`ALTER TABLE proxy_configs ADD COLUMN IF NOT EXISTS webhook_notified_at TIMESTAMPTZ`;
}

/**
 * Aggregator tables, sent as one batched transaction rather than ~18 separate
 * HTTP round trips. The first statement takes an advisory lock so two
 * concurrent cold starts can't collide on `CREATE TABLE IF NOT EXISTS`, which
 * is not race-free in Postgres.
 */
async function initEndpointSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  // Verified against Neon: DDL, advisory locks and ALTER TABLE all work
  // inside a batched HTTP transaction. The driver takes a raw statement as
  // sql(text) — there is no sql.query().
  await sql.transaction(ENDPOINT_DDL.map((statement) => sql(statement)));
}

function toISOString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(value as string).toISOString();
}

function rowToConfig(row: Record<string, unknown>): ProxyConfig {
  return {
    id: row.id as string,
    name: row.name as string,
    target_base_url: row.target_base_url as string,
    auth_header_name: row.auth_header_name as string,
    auth_header_prefix: row.auth_header_prefix as string,
    rate_limit_codes: row.rate_limit_codes as number[],
    cooldown_minutes: row.cooldown_minutes as number,
    master_key: row.master_key as string,
    owner_user_id: (row.owner_user_id as string | null) ?? null,
    webhook_url: (row.webhook_url as string | null) ?? null,
    created_at: toISOString(row.created_at),
  };
}

function rowToKey(row: Record<string, unknown>): ApiKey {
  return {
    id: row.id as number,
    config_id: row.config_id as string,
    key_value: row.key_value as string,
    order_index: row.order_index as number,
    status: row.status as ApiKey["status"],
    exhausted_at: row.exhausted_at ? toISOString(row.exhausted_at) : null,
    request_count: row.request_count as number,
    created_at: toISOString(row.created_at),
  };
}

function rowToAuditEntry(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: row.id as number,
    config_id: row.config_id as string,
    action: row.action as string,
    detail: (row.detail as string) ?? null,
    created_at: toISOString(row.created_at),
  };
}

export async function logAudit(configId: string, action: string, detail?: string): Promise<void> {
  const sql = getSQL();
  await sql`
    INSERT INTO audit_log (config_id, action, detail)
    VALUES (${configId}, ${action}, ${detail ?? null})
  `;
}

export async function getAuditLog(configId: string, limit = 20): Promise<AuditLogEntry[]> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`
    SELECT * FROM audit_log WHERE config_id = ${configId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => rowToAuditEntry(r as Record<string, unknown>));
}

/**
 * Scoped to what the viewer may see. Admins see every config; everyone else
 * sees only their own, so one account holder can't enumerate another's key
 * pools. Pass `null` only from trusted server-side callers that have already
 * done their own authorization.
 */
export async function listConfigs(
  viewer: { id: string; is_admin: boolean } | null
): Promise<ConfigWithStats[]> {
  const sql = getSQL();
  await initSchema();
  const ownerFilter = viewer && !viewer.is_admin ? viewer.id : null;
  const rows = await sql`
    SELECT
      c.*,
      COUNT(k.id)::int                                        AS total,
      COUNT(k.id) FILTER (WHERE k.status = 'active')::int    AS active,
      COUNT(k.id) FILTER (WHERE k.status = 'exhausted')::int AS exhausted,
      COUNT(k.id) FILTER (WHERE k.status = 'cooldown')::int  AS cooldown
    FROM proxy_configs c
    LEFT JOIN api_keys k ON k.config_id = c.id
    WHERE ${ownerFilter}::text IS NULL OR c.owner_user_id = ${ownerFilter}
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `;
  return rows.map((row) => ({
    ...rowToConfig(row as Record<string, unknown>),
    stats: {
      total: (row.total as number) ?? 0,
      active: (row.active as number) ?? 0,
      exhausted: (row.exhausted as number) ?? 0,
      cooldown: (row.cooldown as number) ?? 0,
    },
  }));
}

export async function getConfig(id: string): Promise<ProxyConfig | null> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`SELECT * FROM proxy_configs WHERE id = ${id}`;
  return rows[0] ? rowToConfig(rows[0] as Record<string, unknown>) : null;
}

export async function getConfigByMasterKey(
  masterKey: string
): Promise<ProxyConfig | null> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`SELECT * FROM proxy_configs WHERE master_key = ${masterKey}`;
  return rows[0] ? rowToConfig(rows[0] as Record<string, unknown>) : null;
}

export async function createConfig(
  data: CreateConfigInput,
  ownerUserId: string
): Promise<ProxyConfig> {
  const sql = getSQL();
  await initSchema();
  const id = uuidv4();
  const masterKey = uuidv4();
  const rows = await sql`
    INSERT INTO proxy_configs
      (id, name, target_base_url, auth_header_name, auth_header_prefix, rate_limit_codes, cooldown_minutes, master_key, owner_user_id, webhook_url)
    VALUES
      (${id}, ${data.name}, ${data.target_base_url}, ${data.auth_header_name}, ${data.auth_header_prefix}, ${data.rate_limit_codes}, ${data.cooldown_minutes}, ${masterKey}, ${ownerUserId}, ${data.webhook_url ?? null})
    RETURNING *
  `;
  return rowToConfig(rows[0] as Record<string, unknown>);
}

export async function updateConfig(
  id: string,
  data: UpdateConfigInput,
  known?: ProxyConfig
): Promise<ProxyConfig | null> {
  const sql = getSQL();
  await initSchema();
  const existing = known ?? (await getConfig(id));
  if (!existing) return null;
  const rows = await sql`
    UPDATE proxy_configs SET
      name               = ${data.name ?? existing.name},
      target_base_url    = ${data.target_base_url ?? existing.target_base_url},
      auth_header_name   = ${data.auth_header_name ?? existing.auth_header_name},
      auth_header_prefix = ${data.auth_header_prefix ?? existing.auth_header_prefix},
      rate_limit_codes   = ${data.rate_limit_codes ?? existing.rate_limit_codes},
      cooldown_minutes   = ${data.cooldown_minutes ?? existing.cooldown_minutes},
      webhook_url        = ${data.webhook_url === undefined ? existing.webhook_url : data.webhook_url}
    WHERE id = ${id}
    RETURNING *
  `;
  if (!rows[0]) return null;

  const updated = rowToConfig(rows[0] as Record<string, unknown>);

  // Where a config points is the security-relevant setting: the proxy injects
  // this pool's key into whatever host is on the other end. Record the actual
  // hosts so a redirect to an unexpected destination is visible in the log
  // rather than hidden behind a generic "settings updated".
  const before = hostOf(existing.target_base_url);
  const after = hostOf(updated.target_base_url);
  if (before !== after) {
    await logAudit(id, "target_host_changed", `Target host changed from ${before} to ${after}`);
  } else {
    await logAudit(id, "config_updated", "Updated config settings");
  }

  return updated;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function rotateMasterKey(id: string): Promise<ProxyConfig | null> {
  const sql = getSQL();
  await initSchema();
  const masterKey = uuidv4();
  const rows = await sql`
    UPDATE proxy_configs SET master_key = ${masterKey}
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows[0]) await logAudit(id, "master_key_rotated", "Master key rotated");
  return rows[0] ? rowToConfig(rows[0] as Record<string, unknown>) : null;
}

export async function deleteConfig(id: string): Promise<void> {
  const sql = getSQL();
  await initSchema();
  await sql`DELETE FROM proxy_configs WHERE id = ${id}`;
}

/**
 * Includes the raw secret. Server-side callers that actually forward a request
 * only. Anything that renders or returns keys must use `listKeyViews`.
 */
export async function listKeys(configId: string): Promise<ApiKey[]> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`
    SELECT * FROM api_keys WHERE config_id = ${configId} ORDER BY order_index ASC
  `;
  return rows.map((r) => rowToKey(r as Record<string, unknown>));
}

/** Same rows with the secret reduced to an identifying preview. */
export async function listKeyViews(configId: string): Promise<ApiKeyView[]> {
  const keys = await listKeys(configId);
  return keys.map(toKeyView);
}

export function toKeyView(key: ApiKey): ApiKeyView {
  const { key_value, ...rest } = key;
  return { ...rest, key_preview: previewKey(key_value) };
}

/**
 * Enough to tell two keys apart in a table, not enough to use one. The old UI
 * showed the first 6 characters, which for most providers is a fixed prefix
 * (`sk-pro`, `key_li`) and identifies nothing — the last 4 do the work.
 */
function previewKey(value: string): string {
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

/**
 * Next key to try.
 *
 * `exclude` holds keys already burned during the current request, so a retry
 * can't reselect the key it just exhausted — selection is "lowest order_index
 * that's active", and the exhaust write may not be visible yet.
 */
export async function getActiveKey(
  configId: string,
  exclude?: Set<number>
): Promise<ApiKey | null> {
  const sql = getSQL();
  const excluded = exclude && exclude.size > 0 ? [...exclude] : null;
  const rows = await sql`
    SELECT * FROM api_keys
    WHERE config_id = ${configId} AND status = 'active'
      AND (${excluded}::int[] IS NULL OR NOT (id = ANY(${excluded}::int[])))
    ORDER BY order_index ASC
    LIMIT 1
  `;
  return rows[0] ? rowToKey(rows[0] as Record<string, unknown>) : null;
}

/** Returns how many keys came back off cooldown. */
export async function resetCooldownKeys(
  configId: string,
  cooldownMinutes: number
): Promise<number> {
  const sql = getSQL();
  // Turning cooldown off must not strand the keys that are already resting.
  //
  // markKeyExhausted picks 'cooldown' or 'exhausted' from the setting at the
  // time it runs, and this recovery only ever matched 'cooldown'. So editing
  // a provider from a positive cooldown to 0 left every resting key parked
  // forever, silently shrinking the pool until someone noticed and pressed
  // "Reset all keys". Release them on the way past instead.
  if (cooldownMinutes <= 0) {
    const released = await sql`
      UPDATE api_keys
      SET status = 'active', exhausted_at = NULL
      WHERE config_id = ${configId} AND status = 'cooldown'
      RETURNING id
    `;
    return released.length;
  }
  // RETURNING is what makes the count real. Without it the Neon HTTP driver
  // hands back an empty array for an UPDATE, so this reported 0 every time
  // regardless of how many keys it actually reactivated.
  const rows = await sql`
    UPDATE api_keys
    SET status = 'active', exhausted_at = NULL
    WHERE config_id = ${configId}
      AND status = 'cooldown'
      AND exhausted_at + (${cooldownMinutes} * INTERVAL '1 minute') <= NOW()
    RETURNING id
  `;
  return rows.length;
}

export async function resetAllKeys(configId: string): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE api_keys SET status = 'active', exhausted_at = NULL
    WHERE config_id = ${configId}
  `;
  await logAudit(configId, "keys_reset", "Reset all exhausted/cooldown keys to active");
}

/**
 * Returns whether this caller was the one that flipped the key.
 *
 * The `status = 'active'` predicate makes the transition idempotent under
 * concurrency, but callers previously couldn't tell whether they won — which
 * meant a burst of concurrent requests each counted the same key as "one I
 * exhausted" and the waterfall's per-provider stats would over-report.
 */
export async function markKeyExhausted(
  keyId: number,
  cooldownMinutes: number
): Promise<boolean> {
  const sql = getSQL();
  const newStatus = cooldownMinutes > 0 ? "cooldown" : "exhausted";
  const rows = await sql`
    UPDATE api_keys
    SET status = ${newStatus}, exhausted_at = NOW()
    WHERE id = ${keyId} AND status = 'active'
    RETURNING id
  `;
  return rows.length > 0;
}

export async function insertKeys(
  configId: string,
  keyValues: string[]
): Promise<InsertKeysResult> {
  const sql = getSQL();
  if (keyValues.length === 0) return { inserted: 0, skipped: 0 };

  // Dedupe within the pasted batch itself, preserving first occurrence.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const k of keyValues) {
    if (!seen.has(k)) {
      seen.add(k);
      deduped.push(k);
    }
  }

  /*
   * One statement, and the database decides what is a duplicate.
   *
   * This used to be SELECT-existing, filter in JS, SELECT MAX(order_index),
   * then INSERT — a check-then-act with no constraint behind it, so two
   * concurrent pastes (a double-clicked Add, two tabs, a retried request)
   * both read the pre-insert snapshot and both inserted. That produced a
   * genuinely duplicated key in the pool and a "0 duplicates skipped" message
   * that was simply untrue.
   *
   * ON CONFLICT against the unique index makes the dedupe atomic, and
   * RETURNING makes the count real: whatever comes back is what was actually
   * written, so `skipped` is derived from the outcome rather than predicted
   * from a stale read. order_index is assigned in the same statement from the
   * current MAX, so it cannot interleave either.
   */
  const inserted = await sql`
    INSERT INTO api_keys (config_id, key_value, order_index)
    SELECT
      ${configId},
      k.value,
      COALESCE((SELECT MAX(order_index) FROM api_keys WHERE config_id = ${configId}), 0)
        + k.ordinality
    FROM unnest(${deduped}::text[]) WITH ORDINALITY AS k(value, ordinality)
    ON CONFLICT (config_id, key_value) DO NOTHING
    RETURNING id
  `;

  const skipped = keyValues.length - inserted.length;

  if (inserted.length === 0) return { inserted: 0, skipped };

  await logAudit(
    configId,
    "keys_added",
    `Added ${inserted.length} key${inserted.length === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} duplicate${skipped === 1 ? "" : "s"} skipped)` : ""}`
  );

  return { inserted: inserted.length, skipped };
}

/**
 * Atomic debounce claim for the exhaustion webhook. Under a burst of traffic
 * dozens of requests hit "all keys exhausted" in the same second — only the
 * one that wins this conditional UPDATE sends the notification; the rest see
 * zero rows and stay quiet. The interval is the re-arm time.
 */
export async function claimExhaustionNotify(
  configId: string,
  debounceMinutes: number
): Promise<boolean> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE proxy_configs
    SET webhook_notified_at = NOW()
    WHERE id = ${configId}
      AND webhook_url IS NOT NULL
      AND (webhook_notified_at IS NULL
           OR webhook_notified_at < NOW() - (${debounceMinutes} * INTERVAL '1 minute'))
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Hand the debounce window back when nothing was actually delivered.
 *
 * The claim is deliberately taken before the send, so a burst of concurrent
 * requests produces exactly one message. The cost of that ordering is that a
 * blocked or failed send still consumes the window — this undoes it, so the
 * next request may try again instead of waiting out a debounce for a
 * notification nobody received.
 */
export async function releaseExhaustionNotify(configId: string): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE proxy_configs SET webhook_notified_at = NULL WHERE id = ${configId}
  `;
}

export async function incrementRequestCount(keyId: number): Promise<void> {
  const sql = getSQL();
  await sql`UPDATE api_keys SET request_count = request_count + 1 WHERE id = ${keyId}`;
}

/**
 * Scoped to a config on purpose. `api_keys.id` is a global serial, so deleting
 * by key id alone lets anyone who can reach one config delete keys belonging
 * to another — the config in the URL was previously decorative.
 *
 * Returns false when the key doesn't exist or isn't in that config.
 */
export async function deleteKey(configId: string, keyId: number): Promise<boolean> {
  const sql = getSQL();
  const rows = await sql`
    DELETE FROM api_keys
    WHERE id = ${keyId} AND config_id = ${configId}
    RETURNING id
  `;
  if (rows.length === 0) return false;
  await logAudit(configId, "key_deleted", "Deleted an API key");
  return true;
}

export async function getKeyStats(configId: string): Promise<KeyStats> {
  const sql = getSQL();
  const rows = await sql`
    SELECT
      COUNT(*)::int                                           AS total,
      COUNT(*) FILTER (WHERE status = 'active')::int         AS active,
      COUNT(*) FILTER (WHERE status = 'exhausted')::int      AS exhausted,
      COUNT(*) FILTER (WHERE status = 'cooldown')::int       AS cooldown
    FROM api_keys
    WHERE config_id = ${configId}
  `;
  const row = rows[0] as Record<string, unknown>;
  return {
    total: (row?.total as number) ?? 0,
    active: (row?.active as number) ?? 0,
    exhausted: (row?.exhausted as number) ?? 0,
    cooldown: (row?.cooldown as number) ?? 0,
  };
}
