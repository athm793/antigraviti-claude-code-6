import { type NextRequest } from "next/server";
import { revokeEndpointKey, listEndpointKeys } from "@/lib/endpointsDb";
import { authorizeEndpoint, configAuthResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { id: string; keyId: string };

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "endpoints:revoke-key", 20);
  if (limited) return limited;

  try {
    const { id, keyId } = await params;
    const auth = await authorizeEndpoint(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    // Refuse to revoke the last working key — that would take the endpoint
    // offline with no way back in except issuing a new key, which is exactly
    // the moment someone panics.
    const keys = await listEndpointKeys(id);
    const live = keys.filter((k) => !k.revoked_at);
    if (live.length <= 1 && live.some((k) => k.id === keyId)) {
      return Response.json(
        {
          error:
            "This is the only working key. Create a replacement first, then revoke this one.",
        },
        { status: 409 }
      );
    }

    const revoked = await revokeEndpointKey(id, keyId);
    if (!revoked) return Response.json({ error: "Not found" }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
