import { type NextRequest } from "next/server";
import { resetAllKeys, getKeyStats } from "@/lib/db";

type Params = { id: string };

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;
    await resetAllKeys(id);
    const stats = await getKeyStats(id);
    return Response.json({ success: true, stats });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
