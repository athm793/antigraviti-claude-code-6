import { type NextRequest } from "next/server";
import { deleteKey } from "@/lib/db";

type Params = { id: string; keyId: string };

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { keyId } = await params;
    await deleteKey(Number(keyId));
    return new Response(null, { status: 204 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
