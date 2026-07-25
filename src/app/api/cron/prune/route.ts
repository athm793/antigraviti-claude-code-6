import { timingSafeEqual } from "crypto";
import { initSchema } from "@/lib/db";
import { pruneOldData } from "@/lib/runAnalytics";

/**
 * Scheduled cleanup: aged run history, expired cache rows, stale rate counters.
 *
 * Retention is not a nice-to-have here. Run logs carry the contact data these
 * waterfalls exist to find, so "keep everything forever" is a decision nobody
 * consciously made — this is what makes the per-endpoint retention setting
 * mean something.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Fail-closed. With no CRON_SECRET set this endpoint rejects everything rather
 * than falling back to open — an unauthenticated deletion endpoint is a worse
 * outcome than a cron job that doesn't run.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : header;

  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await initSchema();
    const result = await pruneOldData();
    return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[cron/prune] failed", err);
    return Response.json({ error: "Prune failed" }, { status: 500 });
  }
}
