import { type NextRequest } from "next/server";
import { getConfigByMasterKey } from "@/lib/db";
import { handleProxyRequest, extractMasterKey } from "@/lib/proxy";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { configId: string; path: string[] };

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<Params> }
): Promise<Response> {
  const { configId, path } = await params;

  const masterKey = extractMasterKey(req.headers);
  if (!masterKey) {
    return Response.json({ error: "Missing master key. Send x-master-key header or Authorization: Bearer <key>" }, { status: 401 });
  }

  const config = await getConfigByMasterKey(masterKey);
  if (!config || config.id !== configId) {
    return Response.json({ error: "Invalid master key" }, { status: 403 });
  }

  const pathStr = "/" + path.join("/");
  const queryString = req.nextUrl.search;

  let body: ArrayBuffer | null = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  return handleProxyRequest(
    config,
    pathStr,
    queryString,
    req.method,
    req.headers,
    body
  );
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
