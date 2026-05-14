import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { v4 as uuidv4 } from "uuid";
import type {
  ProxyConfig,
  ApiKey,
  KeyStats,
  ConfigWithStats,
  CreateConfigInput,
  UpdateConfigInput,
  InsertKeysResult,
} from "./types";

function getSQL(): NeonQueryFunction<false, false> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return neon(process.env.DATABASE_URL);
}

export async function initSchema(): Promise<void> {
  const sql = getSQL();
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
  await sql`CREATE INDEX IF NOT EXISTS idx_proxy_configs_master_key ON proxy_configs(master_key)`;
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
    created_at: String(row.created_at),
  };
}

function rowToKey(row: Record<string, unknown>): ApiKey {
  return {
    id: row.id as number,
    config_id: row.config_id as string,
    key_value: row.key_value as string,
    order_index: row.order_index as number,
    status: row.status as ApiKey["status"],
    exhausted_at: row.exhausted_at ? String(row.exhausted_at) : null,
    request_count: row.request_count as number,
    created_at: String(row.created_at),
  };
}

export async function listConfigs(): Promise<ConfigWithStats[]> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`
    SELECT
      c.*,
      COUNT(k.id)::int                                        AS total,
      COUNT(k.id) FILTER (WHERE k.status = 'active')::int    AS active,
      COUNT(k.id) FILTER (WHERE k.status = 'exhausted')::int AS exhausted,
      COUNT(k.id) FILTER (WHERE k.status = 'cooldown')::int  AS cooldown
    FROM proxy_configs c
    LEFT JOIN api_keys k ON k.config_id = c.id
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

export async function createConfig(data: CreateConfigInput): Promise<ProxyConfig> {
  const sql = getSQL();
  await initSchema();
  const id = uuidv4();
  const masterKey = uuidv4();
  const rows = await sql`
    INSERT INTO proxy_configs
      (id, name, target_base_url, auth_header_name, auth_header_prefix, rate_limit_codes, cooldown_minutes, master_key)
    VALUES
      (${id}, ${data.name}, ${data.target_base_url}, ${data.auth_header_name}, ${data.auth_header_prefix}, ${data.rate_limit_codes}, ${data.cooldown_minutes}, ${masterKey})
    RETURNING *
  `;
  return rowToConfig(rows[0] as Record<string, unknown>);
}

export async function updateConfig(
  id: string,
  data: UpdateConfigInput
): Promise<ProxyConfig | null> {
  const sql = getSQL();
  await initSchema();
  const existing = await getConfig(id);
  if (!existing) return null;
  const rows = await sql`
    UPDATE proxy_configs SET
      name               = ${data.name ?? existing.name},
      target_base_url    = ${data.target_base_url ?? existing.target_base_url},
      auth_header_name   = ${data.auth_header_name ?? existing.auth_header_name},
      auth_header_prefix = ${data.auth_header_prefix ?? existing.auth_header_prefix},
      rate_limit_codes   = ${data.rate_limit_codes ?? existing.rate_limit_codes},
      cooldown_minutes   = ${data.cooldown_minutes ?? existing.cooldown_minutes}
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ? rowToConfig(rows[0] as Record<string, unknown>) : null;
}

export async function deleteConfig(id: string): Promise<void> {
  const sql = getSQL();
  await initSchema();
  await sql`DELETE FROM proxy_configs WHERE id = ${id}`;
}

export async function listKeys(configId: string): Promise<ApiKey[]> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`
    SELECT * FROM api_keys WHERE config_id = ${configId} ORDER BY order_index ASC
  `;
  return rows.map((r) => rowToKey(r as Record<string, unknown>));
}

export async function getActiveKey(configId: string): Promise<ApiKey | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM api_keys
    WHERE config_id = ${configId} AND status = 'active'
    ORDER BY order_index ASC
    LIMIT 1
  `;
  return rows[0] ? rowToKey(rows[0] as Record<string, unknown>) : null;
}

export async function resetCooldownKeys(
  configId: string,
  cooldownMinutes: number
): Promise<number> {
  const sql = getSQL();
  const result = await sql`
    UPDATE api_keys
    SET status = 'active', exhausted_at = NULL
    WHERE config_id = ${configId}
      AND status = 'cooldown'
      AND exhausted_at + (${cooldownMinutes} * INTERVAL '1 minute') <= NOW()
  `;
  return result.length;
}

export async function resetAllKeys(configId: string): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE api_keys SET status = 'active', exhausted_at = NULL
    WHERE config_id = ${configId}
  `;
}

export async function markKeyExhausted(
  keyId: number,
  cooldownMinutes: number
): Promise<void> {
  const sql = getSQL();
  const newStatus = cooldownMinutes > 0 ? "cooldown" : "exhausted";
  await sql`
    UPDATE api_keys
    SET status = ${newStatus}, exhausted_at = NOW()
    WHERE id = ${keyId} AND status = 'active'
  `;
}

export async function insertKeys(
  configId: string,
  keyValues: string[]
): Promise<InsertKeysResult> {
  const sql = getSQL();
  if (keyValues.length === 0) return { inserted: 0, skipped: 0 };

  const existingRows = await sql`
    SELECT key_value FROM api_keys WHERE config_id = ${configId}
  `;
  const existingSet = new Set(existingRows.map((r) => r.key_value as string));

  const newKeys = keyValues.filter((k) => !existingSet.has(k));
  const skipped = keyValues.length - newKeys.length;

  if (newKeys.length === 0) return { inserted: 0, skipped };

  const maxResult = await sql`
    SELECT COALESCE(MAX(order_index), 0) AS max_idx FROM api_keys WHERE config_id = ${configId}
  `;
  let nextIdx = (maxResult[0].max_idx as number) + 1;

  for (const keyValue of newKeys) {
    await sql`
      INSERT INTO api_keys (config_id, key_value, order_index)
      VALUES (${configId}, ${keyValue}, ${nextIdx})
    `;
    nextIdx++;
  }

  return { inserted: newKeys.length, skipped };
}

export async function incrementRequestCount(keyId: number): Promise<void> {
  const sql = getSQL();
  await sql`UPDATE api_keys SET request_count = request_count + 1 WHERE id = ${keyId}`;
}

export async function deleteKey(keyId: number): Promise<void> {
  const sql = getSQL();
  await sql`DELETE FROM api_keys WHERE id = ${keyId}`;
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
