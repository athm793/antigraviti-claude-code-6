/**
 * Secret scrubbing for anything that leaves the process or lands in the
 * database — waterfall run logs, step traces, error strings, test-run output.
 *
 * Be clear about what this is: a safety net, not a guarantee. It catches the
 * realistic accident — an upstream that echoes request headers back, a
 * provider that reflects the key in an error message, a mapping that scoops up
 * more of the response than intended. It cannot catch a hostile upstream that
 * base64s the key or splits it across two fields. The structural protection is
 * that only a config's owner can point that config at a destination.
 */

// Below this length a "secret" is more likely to appear in ordinary text than
// to be sensitive, and blanket-replacing it would corrupt logs.
const MIN_SCRUBBABLE_LENGTH = 8;

export const REDACTED = "[redacted]";

/** Show enough of a key to identify it, never enough to use it. */
export function maskSecret(secret: string): string {
  if (secret.length <= 4) return "••••";
  return `••••${secret.slice(-4)}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a reusable scrubber. Compiling the pattern once matters: a run trace
 * can hold dozens of strings and a pool can hold hundreds of keys.
 */
export function createScrubber(secrets: Iterable<string>): (text: string) => string {
  const usable = [...new Set(secrets)]
    .filter((s) => typeof s === "string" && s.length >= MIN_SCRUBBABLE_LENGTH)
    // Longest first, so a key that contains another key is replaced whole.
    .sort((a, b) => b.length - a.length);

  if (usable.length === 0) return (text) => text;

  const pattern = new RegExp(usable.map(escapeRegex).join("|"), "g");
  return (text) => text.replace(pattern, REDACTED);
}

/**
 * Recursively scrubs strings anywhere in a value — object keys included, since
 * a provider can return `{"<the key>": "quota exceeded"}`.
 *
 * Uses a null-prototype object for rebuilt maps and skips `__proto__` and
 * friends, so walking an untrusted upstream body can never pollute
 * Object.prototype for the rest of the warm instance.
 */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function scrubValue<T>(value: T, scrub: (text: string) => string, depth = 0): T {
  if (depth > 24) return value;

  if (typeof value === "string") return scrub(value) as unknown as T;

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, scrub, depth + 1)) as unknown as T;
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      out[scrub(key)] = scrubValue(item, scrub, depth + 1);
    }
    return out as unknown as T;
  }

  return value;
}

/** Convenience wrapper for the common one-shot case. */
export function scrubSecrets<T>(value: T, secrets: Iterable<string>): T {
  return scrubValue(value, createScrubber(secrets));
}

/**
 * Caps a string before it is persisted. Run logs hold upstream response
 * previews; without a cap a handful of chatty providers turn the log table
 * into the largest thing in the database.
 */
export function truncate(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (text.length <= maxBytes) return { text, truncated: false };
  return { text: text.slice(0, maxBytes), truncated: true };
}
