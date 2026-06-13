import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_KEYLEN = 64;

/** Salted scrypt hash, stored as "salt:hash" (both hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const sepIndex = stored.indexOf(":");
  if (sepIndex === -1) return false;
  const salt = stored.slice(0, sepIndex);
  const expected = Buffer.from(stored.slice(sepIndex + 1), "hex");
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
