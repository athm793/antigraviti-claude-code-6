import { type NextRequest } from "next/server";
import { resetAllKeys, getKeyStats } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { id: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "keys:reset", 20);
  if (limited) return limited;

  try {
    const { id } = await params;
    await resetAllKeys(id);
    const stats = await getKeyStats(id);
    return Response.json({ success: true, stats });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
