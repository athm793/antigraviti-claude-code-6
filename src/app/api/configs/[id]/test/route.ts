import { type NextRequest } from "next/server";
import { getActiveKey } from "@/lib/db";
import { authorizeConfig, configAuthResponse } from "@/lib/auth";
import { assertResolvesPublic } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

type Params = { id: string };

const TIMEOUT_MS = 8000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "configs:test", 10);
  if (limited) return limited;

  try {
    const { id } = await params;
    const auth = await authorizeConfig(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    const config = auth.config;

    // Re-checked here rather than trusting the save-time check, because DNS
    // for a public-looking hostname can be repointed at an internal address
    // after the config was created.
    const reachable = await assertResolvesPublic(config.target_base_url);
    if (!reachable.ok) {
      return Response.json({ ok: false, message: reachable.message });
    }

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const upstream = await fetch(config.target_base_url, {
        method: "GET",
        headers,
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });

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
          ? `Timed out after ${TIMEOUT_MS}ms — the target may be unreachable.`
          : "Connection failed — check the target URL is correct and reachable.",
      });
    } finally {
      // Previously only cleared on the success path, leaving a live timer
      // holding the function open after a connection error.
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
