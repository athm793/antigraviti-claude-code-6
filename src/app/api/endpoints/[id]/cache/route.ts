import { type NextRequest } from "next/server";
import { authorizeEndpoint, configAuthResponse } from "@/lib/auth";
import { countCache, purgeCache } from "@/lib/runCache";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) return configAuthResponse(auth.status);
  return Response.json({ cached: await countCache(id) });
}

/**
 * Manual purge.
 *
 * Editing any step already invalidates the cache on its own, because the
 * version id is part of the key. This is for the other case: the *provider*
 * changed its answer and the definition didn't.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = checkRateLimit(req, "endpoints:cache", 20);
  if (limited) return limited;

  const { id } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) return configAuthResponse(auth.status);

  const cleared = await purgeCache(id);
  return Response.json({ cleared });
}
