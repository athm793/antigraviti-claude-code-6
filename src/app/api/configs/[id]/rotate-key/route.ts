import { type NextRequest } from "next/server";
import { rotateMasterKey } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { id: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "configs:rotate-key", 10);
  if (limited) return limited;

  try {
    const { id } = await params;
    const updated = await rotateMasterKey(id);
    if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(updated);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
