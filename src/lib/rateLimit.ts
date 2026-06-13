import type { NextRequest } from "next/server";

const WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function cleanup(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Per-IP fixed-window rate limit. State is held in-memory per server
 * instance — best-effort on multi-instance deployments, but still
 * meaningfully slows down abuse from a single source.
 */
export function checkRateLimit(
  req: NextRequest,
  routeKey: string,
  limit: number
): Response | null {
  const now = Date.now();
  cleanup(now);

  const key = `${routeKey}:${getClientIp(req)}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }

  if (bucket.count >= limit) {
    return Response.json(
      { error: "Too many requests — please slow down and try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) },
      }
    );
  }

  bucket.count += 1;
  return null;
}
