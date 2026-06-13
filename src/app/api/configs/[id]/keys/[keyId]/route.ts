import { type NextRequest } from "next/server";
import { deleteKey } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { id: string; keyId: string };

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "keys:delete", 30);
  if (limited) return limited;

  try {
    const { keyId } = await params;
    await deleteKey(Number(keyId));
    return new Response(null, { status: 204 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
