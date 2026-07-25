import { DEFAULT_SETTINGS, type EndpointSettings } from "../endpointTypes";

/**
 * The canonical form of a run's input, from which the cache key is hashed.
 *
 * Pure and separate from the hashing so it can be tested directly: the whole
 * value of a cache is that two calls meaning the same thing produce the same
 * key, and the whole danger of one is that two calls meaning *different*
 * things do too.
 */

/** Stable stringify — key order must not change the key. */
function canonical(value: unknown, depth = 0): string {
  if (depth > 12) return '"[deep]"';
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    // Order is preserved for arrays: [a, b] and [b, a] are different inputs.
    return `[${value.map((item) => canonical(item, depth + 1)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v, depth + 1)}`).join(",")}}`;
}

/**
 * Which fields participate, and in what form.
 *
 * `cache_key_normalize` lowercases and trims strings, so "Acme.com " and
 * "acme.com" share a cached answer. It is on by default because for the
 * flagship use case — domains, emails, company names — they genuinely are the
 * same lookup, and paying twice for them is the thing a cache exists to stop.
 */
export function canonicalizeInput(
  input: Record<string, unknown>,
  settings?: Partial<EndpointSettings>
): string {
  const merged = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  const include = merged.cache_key_fields;
  const exclude = new Set(merged.cache_key_exclude ?? []);

  const picked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (include && !include.includes(key)) continue;
    if (exclude.has(key)) continue;
    if (value === undefined || value === null) continue;
    picked[key] =
      merged.cache_key_normalize && typeof value === "string"
        ? value.trim().toLowerCase()
        : value;
  }

  return canonical(picked);
}

/**
 * The string that gets hashed.
 *
 * The owner is in the key so one tenant's enriched contact can never be served
 * to another. The version is in it because that *is* the invalidation story:
 * edit a step and every cached answer for the old definition goes cold on its
 * own, with nothing to remember to purge.
 */
export function cacheKeyMaterial(parts: {
  ownerId: string | null;
  endpointId: string;
  versionId: string | null;
  input: Record<string, unknown>;
  settings?: Partial<EndpointSettings>;
}): string {
  return [
    "v1",
    parts.ownerId ?? "none",
    parts.endpointId,
    parts.versionId ?? "none",
    canonicalizeInput(parts.input, parts.settings),
  ].join("\n");
}
