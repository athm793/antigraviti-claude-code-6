import type { ProxyConfig } from "./types";
import {
  executeWithRotation,
  recoverCooldownKeys,
  sanitizeResponseHeaders,
} from "./rotation";

/**
 * Pass-through proxy.
 *
 * A thin adapter over the shared rotation engine in rotation.ts. The response
 * body is streamed straight through and never read here — that is what keeps
 * an arbitrarily large upstream response cheap, and it's the property the
 * waterfall executor deliberately gives up in exchange for being able to
 * inspect the body.
 */
export async function handleProxyRequest(
  config: ProxyConfig,
  path: string,
  queryString: string,
  method: string,
  incomingHeaders: Headers,
  body: ArrayBuffer | null
): Promise<Response> {
  await recoverCooldownKeys(config);

  const result = await executeWithRotation(config, {
    path,
    queryString,
    method,
    headers: incomingHeaders,
    body,
  });

  if (result.ok && result.response) {
    return new Response(result.response.body, {
      status: result.response.status,
      headers: sanitizeResponseHeaders(result.response.headers),
    });
  }

  switch (result.error?.kind) {
    case "no_keys":
      return Response.json(
        { error: "All API keys exhausted", proxy: true },
        { status: 503 }
      );
    case "all_exhausted":
      return Response.json(
        { error: "All API keys exhausted after rotation", proxy: true },
        { status: 503 }
      );
    case "blocked_target":
      return Response.json(
        { error: "Request blocked", detail: result.error.detail, proxy: true },
        { status: 400 }
      );
    case "timeout":
      return Response.json(
        { error: "Upstream timed out", proxy: true },
        { status: 504 }
      );
    default:
      // Deliberately generic: the old message interpolated the raw fetch error,
      // which leaked the target hostname (and any userinfo in it) to whoever
      // held the master key.
      return Response.json(
        { error: "Upstream fetch failed", proxy: true },
        { status: 502 }
      );
  }
}

export function extractMasterKey(headers: Headers): string | null {
  const xKey = headers.get("x-master-key");
  if (xKey) return xKey;
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}
