import { type NextRequest } from "next/server";
import { getConfig, getActiveKey } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { id: string };

const TIMEOUT_MS = 8000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "configs:test", 10);
  if (limited) return limited;

  const { id } = await params;

  const config = await getConfig(id);
  if (!config) return Response.json({ error: "Not found" }, { status: 404 });

  const key = await getActiveKey(id);
  if (!key) {
    return Response.json({
      ok: false,
      message: "No active API keys — add keys or reset cooldown/exhausted keys first.",
    });
  }

  const headers = new Headers();
  headers.set(config.auth_header_name, `${config.auth_header_prefix}${key.key_value}`);

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const upstream = await fetch(config.target_base_url, {
      method: "GET",
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;
    const rateLimitCodes = new Set(config.rate_limit_codes);

    return Response.json({
      ok: !rateLimitCodes.has(upstream.status) && upstream.status < 500,
      status: upstream.status,
      latencyMs,
      message:
        upstream.status >= 500
          ? `Target returned ${upstream.status} — the API itself may be down.`
          : rateLimitCodes.has(upstream.status)
            ? `Target returned ${upstream.status} — this key looks rate-limited.`
            : `Reached target in ${latencyMs}ms (HTTP ${upstream.status}). A non-2xx status on the root path is often normal.`,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const aborted = err instanceof Error && err.name === "AbortError";
    return Response.json({
      ok: false,
      latencyMs,
      message: aborted
        ? `Timed out after ${TIMEOUT_MS}ms — target_base_url may be unreachable.`
        : `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
