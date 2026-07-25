import { type NextRequest } from "next/server";
import { issueEndpointKey, listEndpointKeys } from "@/lib/endpointsDb";
import { authorizeEndpoint, configAuthResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { id: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeEndpoint(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    // Metadata only — key hashes never leave the database, and the plaintext
    // was never stored in the first place.
    const keys = await listEndpointKeys(id);
    return Response.json(keys);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "endpoints:issue-key", 10);
  if (limited) return limited;

  try {
    const { id } = await params;
    const auth = await authorizeEndpoint(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    const body = (await req.json().catch(() => ({}))) as { label?: string };
    const key = await issueEndpointKey(id, body.label?.trim() || "Untitled key");

    // Only moment the full key exists outside the caller's hands.
    return Response.json(key, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
