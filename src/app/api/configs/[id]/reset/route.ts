import { type NextRequest } from "next/server";
import { resetAllKeys, getKeyStats } from "@/lib/db";
import { authorizeConfig, configAuthResponse } from "@/lib/auth";
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
    const auth = await authorizeConfig(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    await resetAllKeys(id);
    const stats = await getKeyStats(id);
    return Response.json({ success: true, stats });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
