/**
 * DDL for the aggregator tables, kept as strings so the whole set can be sent
 * as one batched transaction instead of ~15 sequential HTTP round trips on
 * every cold start.
 */
export const ENDPOINT_DDL: string[] = [
  // A lock held for the duration of the transaction. CREATE TABLE IF NOT
  // EXISTS is not race-free in Postgres — two concurrent cold starts can
  // collide with a duplicate-key error on the system catalogue.
  `SELECT pg_advisory_xact_lock(hashtext('keyproxy_schema'))`,

  `CREATE TABLE IF NOT EXISTS endpoints (
     id                 TEXT        PRIMARY KEY,
     name               TEXT        NOT NULL,
     slug               TEXT        NOT NULL UNIQUE,
     description        TEXT        NOT NULL DEFAULT '',
     owner_user_id      TEXT        REFERENCES users(id) ON DELETE SET NULL,
     active_version_id  TEXT,
     revision           INTEGER     NOT NULL DEFAULT 1,
     enabled            BOOLEAN     NOT NULL DEFAULT true,
     cache_enabled      BOOLEAN     NOT NULL DEFAULT false,
     cache_ttl_seconds  INTEGER     NOT NULL DEFAULT 86400,
     run_deadline_ms    INTEGER     NOT NULL DEFAULT 50000,
     log_retention_days INTEGER     NOT NULL DEFAULT 30,
     log_bodies         BOOLEAN     NOT NULL DEFAULT false,
     created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_endpoints_owner ON endpoints(owner_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_endpoints_slug ON endpoints(slug)`,

  `CREATE TABLE IF NOT EXISTS endpoint_versions (
     id          TEXT        PRIMARY KEY,
     endpoint_id TEXT        NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
     version_no  INTEGER     NOT NULL,
     definition  JSONB       NOT NULL DEFAULT '{}'::jsonb,
     note        TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (endpoint_id, version_no)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_endpoint_versions_endpoint
     ON endpoint_versions(endpoint_id, version_no DESC)`,
  // Answers "which endpoints use this provider?" without a steps table.
  `CREATE INDEX IF NOT EXISTS idx_endpoint_versions_definition
     ON endpoint_versions USING GIN (definition jsonb_path_ops)`,

  // Hashed keys, many per endpoint so rotation has a grace window rather than
  // the hard cutover proxy_configs.master_key does.
  `CREATE TABLE IF NOT EXISTS endpoint_keys (
     id           TEXT        PRIMARY KEY,
     endpoint_id  TEXT        NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
     key_id       TEXT        NOT NULL UNIQUE,
     key_hash     TEXT        NOT NULL,
     label        TEXT        NOT NULL DEFAULT '',
     last_used_at TIMESTAMPTZ,
     revoked_at   TIMESTAMPTZ,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_endpoint_keys_endpoint ON endpoint_keys(endpoint_id)`,

  `CREATE TABLE IF NOT EXISTS endpoint_runs (
     id              TEXT        PRIMARY KEY,
     endpoint_id     TEXT        NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
     version_id      TEXT        REFERENCES endpoint_versions(id) ON DELETE SET NULL,
     status          TEXT        NOT NULL,
     resolved_by     TEXT,
     cache_hit       BOOLEAN     NOT NULL DEFAULT false,
     credits_used    INTEGER     NOT NULL DEFAULT 0,
     cost_cents      INTEGER     NOT NULL DEFAULT 0,
     duration_ms     INTEGER     NOT NULL DEFAULT 0,
     input           JSONB,
     output          JSONB,
     error           TEXT,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_endpoint_runs_endpoint_created
     ON endpoint_runs(endpoint_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_endpoint_runs_created ON endpoint_runs(created_at)`,

  `CREATE TABLE IF NOT EXISTS endpoint_run_steps (
     id              SERIAL      PRIMARY KEY,
     run_id          TEXT        NOT NULL REFERENCES endpoint_runs(id) ON DELETE CASCADE,
     step_key        TEXT        NOT NULL,
     step_index      INTEGER     NOT NULL,
     group_id        TEXT,
     -- Deliberately not a foreign key: a provider may be deleted later and
     -- the historical run should survive it.
     config_id       TEXT,
     config_name     TEXT,
     status          TEXT        NOT NULL,
     skip_reason     TEXT,
     http_status     INTEGER,
     latency_ms      INTEGER     NOT NULL DEFAULT 0,
     attempts        INTEGER     NOT NULL DEFAULT 0,
     keys_exhausted  INTEGER     NOT NULL DEFAULT 0,
     cost_cents      INTEGER     NOT NULL DEFAULT 0,
     trace           JSONB,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_run_steps_run ON endpoint_run_steps(run_id, step_index)`,
  `CREATE INDEX IF NOT EXISTS idx_run_steps_config_created
     ON endpoint_run_steps(config_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS endpoint_cache (
     cache_key   TEXT        PRIMARY KEY,
     endpoint_id TEXT        NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
     version_id  TEXT,
     result      JSONB       NOT NULL,
     run_id      TEXT,
     hit_count   INTEGER     NOT NULL DEFAULT 0,
     expires_at  TIMESTAMPTZ NOT NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_endpoint_cache_expires ON endpoint_cache(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_endpoint_cache_endpoint ON endpoint_cache(endpoint_id)`,

  // Circular reference, so the constraint is added after both tables exist.
  // ADD CONSTRAINT is not idempotent — drop first.
  `ALTER TABLE endpoints DROP CONSTRAINT IF EXISTS fk_endpoints_active_version`,
  `ALTER TABLE endpoints ADD CONSTRAINT fk_endpoints_active_version
     FOREIGN KEY (active_version_id) REFERENCES endpoint_versions(id) ON DELETE SET NULL`,
];
