import { type NextRequest } from "next/server";
import { listKeys, insertKeys } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { id: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;
    const keys = await listKeys(id);
    return Response.json(keys);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "keys:add", 20);
  if (limited) return limited;

  try {
    const { id } = await params;
    const body = (await req.json()) as { keys: unknown };

    if (!Array.isArray(body.keys)) {
      return Response.json({ error: "keys must be an array" }, { status: 400 });
    }

    const keyValues = (body.keys as unknown[])
      .map((k) => String(k).trim())
      .filter((k) => k.length > 0);

    if (keyValues.length === 0) {
      return Response.json(
        { error: "No valid keys provided" },
        { status: 400 }
      );
    }

    const result = await insertKeys(id, keyValues);
    return Response.json(result, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
