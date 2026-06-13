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
    const id = Number(keyId);
    if (!Number.isInteger(id)) {
      return Response.json({ error: "Invalid key id" }, { status: 400 });
    }
    await deleteKey(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
