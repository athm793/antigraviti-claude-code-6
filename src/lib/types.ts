export type KeyStatus = "active" | "exhausted" | "cooldown";

export interface ProxyConfig {
  id: string;
  name: string;
  target_base_url: string;
  auth_header_name: string;
  auth_header_prefix: string;
  rate_limit_codes: number[];
  cooldown_minutes: number;
  master_key: string;
  owner_user_id: string | null;
  created_at: string;
}

/**
 * The full row, including the upstream secret. Server-side only — the proxy
 * and rotation layer need `key_value`, nothing else does.
 */
export interface ApiKey {
  id: number;
  config_id: string;
  key_value: string;
  order_index: number;
  status: KeyStatus;
  exhausted_at: string | null;
  request_count: number;
  created_at: string;
}

/**
 * What the dashboard and every API response get: identical to ApiKey but with
 * the secret replaced by a display-only preview. Upstream keys are the asset
 * this product exists to protect, and the browser has never needed their
 * values — the old UI fetched them in full and masked them in JavaScript,
 * which left them readable in devtools.
 */
export type ApiKeyView = Omit<ApiKey, "key_value"> & { key_preview: string };

export interface KeyStats {
  total: number;
  active: number;
  exhausted: number;
  cooldown: number;
}

export interface ConfigWithStats extends ProxyConfig {
  stats: KeyStats;
}

export interface CreateConfigInput {
  name: string;
  target_base_url: string;
  auth_header_name: string;
  auth_header_prefix: string;
  rate_limit_codes: number[];
  cooldown_minutes: number;
}

export interface UpdateConfigInput {
  name?: string;
  target_base_url?: string;
  auth_header_name?: string;
  auth_header_prefix?: string;
  rate_limit_codes?: number[];
  cooldown_minutes?: number;
}

export interface InsertKeysResult {
  inserted: number;
  skipped: number;
}

export interface AuditLogEntry {
  id: number;
  config_id: string;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}
