import { type NextRequest } from "next/server";
import { getConfigByMasterKey, getActiveKey } from "@/lib/db";
import { extractMasterKey } from "@/lib/proxy";

export const runtime = "nodejs";

type Params = { configId: string; path: string[] };

const STRIP = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "content-length",
  "accept-encoding", "x-master-key", "authorization", "forwarded",
  "x-real-ip", "x-invocation-id", "x-matched-path",
  "x-vercel-sc-basepath", "x-vercel-sc-headers", "x-vercel-sc-host",
]);

function isInfra(name: string) {
  return name.startsWith("x-vercel-") || name.startsWith("x-forwarded-");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { configId, path } = await params;

  const masterKey = extractMasterKey(req.headers);
  if (!masterKey) return Response.json({ error: "Missing master key" }, { status: 401 });

  const config = await getConfigByMasterKey(masterKey);
  if (!config || config.id !== configId) return Response.json({ error: "Invalid master key" }, { status: 403 });

  const key = await getActiveKey(config.id);

  const pathStr = "/" + path.join("/");
  const targetUrl = config.target_base_url.replace(/\/$/, "") + pathStr + req.nextUrl.search;

  const bodyBuffer = await req.arrayBuffer();
  const bodyText = new TextDecoder().decode(bodyBuffer);

  // Build headers exactly as the real proxy does
  const forwardHeaders = new Headers();
  const sentHeaders: Record<string, string> = {};
  const skippedHeaders: string[] = [];

  for (const [name, value] of req.headers.entries()) {
    const lower = name.toLowerCase();
    if (STRIP.has(lower) || isInfra(lower)) { skippedHeaders.push(name); continue; }
    if (lower === "authorization") { skippedHeaders.push(name); continue; }
    forwardHeaders.set(name, value);
    sentHeaders[name] = value;
  }

  if (key) {
    const authValue = `${config.auth_header_prefix}${key.key_value}`;
    forwardHeaders.set(config.auth_header_name, authValue);
    sentHeaders[config.auth_header_name] = `${config.auth_header_prefix}${key.key_value.slice(0, 6)}...`;
  }

  // Actually make the request
  let responseStatus: number;
  let responseHeaders: Record<string, string> = {};
  let responseBody: string;

  try {
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: forwardHeaders,
      body: bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
      redirect: "manual",
      cache: "no-store",
    });

    responseStatus = upstream.status;
    upstream.headers.forEach((v, k) => { responseHeaders[k] = v; });
    responseBody = await upstream.text();
  } catch (err) {
    responseStatus = 0;
    responseBody = String(err);
  }

  return Response.json({
    sent: {
      url: targetUrl,
      method: "POST",
      headers: sentHeaders,
      skipped_headers: skippedHeaders,
      body_bytes: bodyBuffer.byteLength,
      body: bodyText,
    },
    received: {
      status: responseStatus,
      headers: responseHeaders,
      body: responseBody.slice(0, 1000),
    },
    key_used: key ? `${key.key_value.slice(0, 6)}... (order #${key.order_index})` : "NO ACTIVE KEY",
  });
}
