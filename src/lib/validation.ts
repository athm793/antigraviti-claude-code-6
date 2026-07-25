export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Why this file is stricter than it looks like it needs to be:
 *
 * KeyProxy injects a customer's upstream API key into every request it
 * forwards. That makes "where does this request go?" a security decision, not
 * a formatting one — a config pointed at an internal address turns the proxy
 * into an SSRF primitive, and one pointed at attacker infrastructure hands
 * over the key. Waterfall steps make this sharper still, because parts of the
 * URL come from the *caller's* input rather than from the operator.
 */

export type TargetRejection =
  | "not_a_url"
  | "bad_protocol"
  | "has_credentials"
  | "private_address"
  | "blocked_hostname"
  | "own_host";

export interface TargetCheck {
  ok: boolean;
  reason?: TargetRejection;
  message?: string;
}

const OK: TargetCheck = { ok: true };

function reject(reason: TargetRejection, message: string): TargetCheck {
  return { ok: false, reason, message };
}

// Hostnames that never belong to a public API, regardless of what they resolve to.
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".home.arpa",
];

function parseIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/**
 * Blocks loopback, link-local (which is where cloud metadata lives at
 * 169.254.169.254), RFC1918, CGNAT, and the various reserved ranges.
 */
function isPrivateIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");

  if (h === "::1" || h === "::") return true;

  // IPv4-mapped (::ffff:10.0.0.1) and IPv4-compatible forms — judge the v4 part.
  const mapped = h.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const octets = parseIPv4(mapped[1]);
    return octets ? isPrivateIPv4(octets) : true;
  }

  const head = h.split(":")[0];
  if (head.length === 0) return false;
  const prefix = parseInt(head.slice(0, 4).padEnd(4, "0"), 16);
  if (Number.isNaN(prefix)) return false;

  if ((prefix & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((prefix & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((prefix & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** True when the literal hostname is a private/loopback/link-local address. */
export function isPrivateAddress(hostname: string): boolean {
  const octets = parseIPv4(hostname);
  if (octets) return isPrivateIPv4(octets);
  if (hostname.includes(":")) return isPrivateIPv6(hostname);
  return false;
}

function ownHostnames(): string[] {
  const raw = [
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  const hosts: string[] = [];
  for (const value of raw) {
    try {
      hosts.push(new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase());
    } catch {
      hosts.push(value.toLowerCase());
    }
  }
  return hosts;
}

/**
 * Synchronous, literal-value check. Safe to call on every save and as a fast
 * pre-flight before a fetch.
 *
 * Deliberate limitation: this cannot see what a hostname *resolves* to, so a
 * domain whose DNS points at 10.0.0.1 passes here. `assertResolvesPublic`
 * closes that gap at request time; this function exists to give a clear error
 * at the moment someone types a bad URL.
 */
export function checkPublicHttpTarget(value: string): TargetCheck {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return reject("not_a_url", "Enter a valid URL, including https://");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return reject("bad_protocol", "Only http:// and https:// URLs are supported");
  }

  if (url.username || url.password) {
    return reject(
      "has_credentials",
      "Remove the username and password from the URL — store credentials as API keys instead"
    );
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    return reject("blocked_hostname", `${url.hostname} is an internal hostname and can't be used as a target`);
  }

  if (isPrivateAddress(hostname)) {
    return reject(
      "private_address",
      `${url.hostname} is a private or link-local address. Targets must be reachable on the public internet.`
    );
  }

  if (ownHostnames().includes(hostname)) {
    return reject("own_host", "A target can't point back at KeyProxy itself");
  }

  return OK;
}

/**
 * Request-time check that also validates what the hostname actually resolves
 * to, which is what stops a public-looking domain from pointing at an internal
 * address (including via DNS rebinding between save and use).
 *
 * Node-only — callers must be on the nodejs runtime. Resolution failures are
 * treated as *allowed* here: the fetch that follows will fail on its own, and
 * failing closed on a transient DNS blip would take down working waterfalls.
 */
export async function assertResolvesPublic(value: string): Promise<TargetCheck> {
  const literal = checkPublicHttpTarget(value);
  if (!literal.ok) return literal;

  const hostname = new URL(value).hostname.toLowerCase();
  if (isPrivateAddress(hostname)) {
    return reject("private_address", `${hostname} is a private address`);
  }

  try {
    const { lookup } = await import("node:dns/promises");
    const results = await lookup(hostname, { all: true });
    for (const { address } of results) {
      if (isPrivateAddress(address)) {
        return reject(
          "private_address",
          `${hostname} resolves to the private address ${address}`
        );
      }
    }
  } catch {
    return OK;
  }

  return OK;
}

/**
 * Rate-limit status codes must be codes an upstream can actually use to signal
 * throttling. Allowing 2xx here is a live footgun: the proxy retries every
 * response whose status is in this list, so `[200]` silently turns one call
 * into up to MAX_ROTATION_ATTEMPTS upstream calls and burns the whole pool.
 */
export function normalizeRateLimitCodes(input: unknown): number[] | null {
  if (!Array.isArray(input)) return null;

  const codes: number[] = [];
  for (const raw of input) {
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isInteger(n) || n < 400 || n > 599) return null;
    if (!codes.includes(n)) codes.push(n);
  }

  if (codes.length === 0) return null;
  return codes.sort((a, b) => a - b);
}
