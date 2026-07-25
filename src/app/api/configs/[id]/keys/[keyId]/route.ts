import { type NextRequest } from "next/server";
import { deleteKey } from "@/lib/db";
import { authorizeConfig, configAuthResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { id: string; keyId: string };

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "keys:delete", 30);
  if (limited) return limited;

  try {
    const { id, keyId } = await params;
    const auth = await authorizeConfig(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    const numericKeyId = Number(keyId);
    if (!Number.isInteger(numericKeyId)) {
      return Response.json({ error: "Invalid key id" }, { status: 400 });
    }

    const deleted = await deleteKey(id, numericKeyId);
    if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
