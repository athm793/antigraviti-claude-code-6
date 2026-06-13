import type { ProxyConfig, ApiKey } from "./types";
import {
  getActiveKey,
  markKeyExhausted,
  incrementRequestCount,
  resetCooldownKeys,
} from "./db";

const MAX_ROTATION_ATTEMPTS = 200;

const HOP_BY_HOP_REQUEST = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "accept-encoding",
  "x-master-key",
  // Vercel infrastructure headers — must not reach the target API
  "forwarded",
  "x-real-ip",
  "x-invocation-id",
  "x-matched-path",
  "x-vercel-sc-basepath",
  "x-vercel-sc-headers",
  "x-vercel-sc-host",
]);

function isInfraHeader(name: string): boolean {
  return (
    name.startsWith("x-vercel-") ||
    name.startsWith("x-forwarded-")
  );
}

const HOP_BY_HOP_RESPONSE = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

export async function handleProxyRequest(
  config: ProxyConfig,
  path: string,
  queryString: string,
  method: string,
  incomingHeaders: Headers,
  body: ArrayBuffer | null
): Promise<Response> {
  const rateLimitCodes = new Set(config.rate_limit_codes);

  if (config.cooldown_minutes > 0) {
    await resetCooldownKeys(config.id, config.cooldown_minutes);
  }

  for (let attempt = 0; attempt < MAX_ROTATION_ATTEMPTS; attempt++) {
    const key = await getActiveKey(config.id);
    if (!key) {
      return Response.json(
        { error: "All API keys exhausted", proxy: true },
        { status: 503 }
      );
    }

    const targetUrl = buildTargetUrl(
      config.target_base_url,
      path,
      queryString
    );
    const forwardHeaders = buildForwardHeaders(config, key, incomingHeaders);

    let upstream: Response;
    try {
      upstream = await fetch(targetUrl, {
        method,
        headers: forwardHeaders,
        body: body && body.byteLength > 0 ? body : undefined,
        redirect: "manual",
        cache: "no-store",
      });
    } catch (err) {
      return Response.json(
        { error: "Upstream fetch failed", detail: String(err), proxy: true },
        { status: 502 }
      );
    }

    if (rateLimitCodes.has(upstream.status)) {
      await markKeyExhausted(key.id, config.cooldown_minutes);
      continue;
    }

    await incrementRequestCount(key.id);

    const responseHeaders = sanitizeResponseHeaders(upstream.headers);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  return Response.json(
    { error: "All API keys exhausted after rotation", proxy: true },
    { status: 503 }
  );
}

function buildTargetUrl(
  baseUrl: string,
  path: string,
  queryString: string
): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${path}${queryString}`;
}

function buildForwardHeaders(
  config: ProxyConfig,
  key: ApiKey,
  incoming: Headers
): Headers {
  const out = new Headers();

  for (const [name, value] of incoming.entries()) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_REQUEST.has(lower)) continue;
    if (isInfraHeader(lower)) continue;
    if (lower === "authorization") continue;
    out.set(name, value);
  }

  out.set(
    config.auth_header_name,
    `${config.auth_header_prefix}${key.key_value}`
  );

  return out;
}

function sanitizeResponseHeaders(incoming: Headers): Headers {
  const out = new Headers();
  for (const [name, value] of incoming.entries()) {
    if (HOP_BY_HOP_RESPONSE.has(name.toLowerCase())) continue;
    out.set(name, value);
  }
  return out;
}

export function extractMasterKey(headers: Headers): string | null {
  const xKey = headers.get("x-master-key");
  if (xKey) return xKey;
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}
