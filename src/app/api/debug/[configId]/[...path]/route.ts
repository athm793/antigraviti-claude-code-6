import { type NextRequest } from "next/server";
import { getConfigByMasterKey, listKeys } from "@/lib/db";
import { extractMasterKey } from "@/lib/proxy";
import { executeWithRotation, filterForwardableHeaders } from "@/lib/rotation";
import { createScrubber, scrubValue, maskSecret, truncate } from "@/lib/redact";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = { configId: string; path: string[] };

const MAX_BODY_PREVIEW = 4000;

/**
 * Request inspector.
 *
 * Fail-closed behind ENABLE_DEBUG_ROUTE. This endpoint reflects the outbound
 * request and the upstream response back to whoever holds the master key,
 * which is exactly the shape of an SSRF-with-reflection primitive — useful
 * while wiring up a provider, not something to leave switched on in
 * production. Everything it returns is run through the secret scrubber, and
 * the injected credential is masked rather than previewed.
 */
function debugEnabled(): boolean {
  return process.env.ENABLE_DEBUG_ROUTE === "true";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  if (!debugEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const limited = checkRateLimit(req, "debug:request", 20);
  if (limited) return limited;

  try {
    const { configId, path } = await params;

    const masterKey = extractMasterKey(req.headers);
    if (!masterKey) {
      return Response.json({ error: "Missing master key" }, { status: 401 });
    }

    const config = await getConfigByMasterKey(masterKey);
    if (!config || config.id !== configId) {
      return Response.json({ error: "Invalid master key" }, { status: 403 });
    }

    const bodyBuffer = await req.arrayBuffer();
    const pathStr = `/${path.join("/")}`;

    const result = await executeWithRotation(config, {
      path: pathStr,
      queryString: req.nextUrl.search,
      method: "POST",
      headers: req.headers,
      body: bodyBuffer,
      // One attempt only: this is an inspector, not a request that should
      // chew through the pool. It also means a rate-limit response is shown
      // to the caller instead of being silently rotated past.
      maxAttempts: 1,
      verifyTarget: true,
      timeoutMs: 10_000,
    });

    // Scrub against every key in the pool, not just the one used — an upstream
    // error can quote a different key than the one that made the call.
    const pool = await listKeys(config.id);
    const scrub = createScrubber([
      ...pool.map((k) => k.key_value),
      config.master_key,
    ]);

    const sentHeaders: Record<string, string> = {};
    for (const [name, value] of filterForwardableHeaders(req.headers).entries()) {
      sentHeaders[name] = value;
    }
    // The auth header is set by the rotation layer; show that it was set and
    // which key, never the value.
    const usedKey = pool.find((k) => k.id === result.keyId);
    sentHeaders[config.auth_header_name] = usedKey
      ? `${config.auth_header_prefix}${maskSecret(usedKey.key_value)}`
      : "(no active key)";

    let received: Record<string, unknown> = {
      status: null,
      headers: {},
      body: null,
    };

    if (result.ok && result.response) {
      const headers: Record<string, string> = {};
      result.response.headers.forEach((v, k) => {
        headers[k] = v;
      });
      const raw = await result.response.text();
      const { text, truncated } = truncate(raw, MAX_BODY_PREVIEW);
      received = {
        status: result.response.status,
        headers,
        body: text,
        body_truncated: truncated,
      };
    }

    const payload = {
      sent: {
        url: result.url,
        method: "POST",
        headers: sentHeaders,
        body_bytes: bodyBuffer.byteLength,
        body: truncate(new TextDecoder().decode(bodyBuffer), MAX_BODY_PREVIEW).text,
      },
      received,
      rotation: {
        attempts: result.attempts,
        keys_exhausted: result.keysExhausted,
        key_order_index: result.keyOrderIndex,
        latency_ms: result.latencyMs,
        error: result.error,
      },
    };

    return Response.json(scrubValue(payload, scrub));
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
