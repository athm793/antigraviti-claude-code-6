import { type NextRequest } from "next/server";
import { rotateMasterKey } from "@/lib/db";
import { authorizeConfig, configAuthResponse } from "@/lib/auth";
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
    const auth = await authorizeConfig(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    const updated = await rotateMasterKey(id);
    if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(updated);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
