import { randomBytes, timingSafeEqual, createHash } from "crypto";
import { ENDPOINT_KEY_PREFIX } from "./endpointKeyFormat";

/**
 * Endpoint API keys.
 *
 * Deliberately not modelled on `proxy_configs.master_key`, which is a bare
 * UUID stored in plaintext: a database snapshot, a support query or one
 * over-broad API response hands over working credentials for every provider.
 *
 * Format: kp_ep_<keyId>_<secret>
 *
 *   keyId  — public, indexed, safe to log. Identifies which key was used.
 *   secret — 32 random bytes, base64url. Shown once at creation, then only
 *            its SHA-256 is kept.
 *
 * SHA-256 rather than scrypt is the right call here, unlike passwords: the
 * secret carries 256 bits of entropy, so there is nothing to brute-force, and
 * this sits on the hot path of every waterfall call.
 */

const PREFIX = ENDPOINT_KEY_PREFIX;
const KEY_ID_BYTES = 6;
const SECRET_BYTES = 32;

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface GeneratedKey {
  keyId: string;
  secret: string;
  /** The only time the full key exists. */
  plaintext: string;
  hash: string;
}

export function generateEndpointKey(): GeneratedKey {
  // Hex, deliberately, not base64url: the base64url alphabet includes "_",
  // which is also the field separator. A key id containing an underscore
  // would be split in the wrong place on parse, and authentication would
  // fail for that key. The secret may still contain "_" — it's the last
  // field, so nothing after it needs splitting.
  const keyId = randomBytes(KEY_ID_BYTES).toString("hex");
  const secret = base64url(randomBytes(SECRET_BYTES));
  return {
    keyId,
    secret,
    plaintext: `${PREFIX}_${keyId}_${secret}`,
    hash: hashSecret(secret),
  };
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export interface ParsedKey {
  keyId: string;
  secret: string;
}

export function parseEndpointKey(raw: string): ParsedKey | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(`${PREFIX}_`)) return null;

  const rest = trimmed.slice(PREFIX.length + 1);
  const sep = rest.indexOf("_");
  if (sep <= 0) return null;

  const keyId = rest.slice(0, sep);
  const secret = rest.slice(sep + 1);
  if (!keyId || !secret) return null;

  // The id is always hex, so a stray underscore can't have moved the split.
  if (!/^[0-9a-f]+$/.test(keyId)) return null;

  return { keyId, secret };
}

/** Constant-time compare, so a wrong key can't be narrowed down by timing. */
export function verifySecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(secret), "hex");
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHash, "hex");
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Reads the endpoint key off a request. */
export function extractEndpointKey(headers: Headers): string | null {
  const direct = headers.get("x-endpoint-key");
  if (direct) return direct;
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}
