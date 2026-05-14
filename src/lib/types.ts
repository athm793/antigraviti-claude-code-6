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
  created_at: string;
}

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
