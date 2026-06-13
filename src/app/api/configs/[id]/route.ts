import { type NextRequest } from "next/server";
import { getConfig, updateConfig, deleteConfig, getKeyStats } from "@/lib/db";
import { isValidHttpUrl } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rateLimit";
import type { UpdateConfigInput } from "@/lib/types";

type Params = { id: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;
    const config = await getConfig(id);
    if (!config) return Response.json({ error: "Not found" }, { status: 404 });
    const stats = await getKeyStats(id);
    return Response.json({ ...config, stats });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "configs:update", 30);
  if (limited) return limited;

  try {
    const { id } = await params;
    const body = (await req.json()) as UpdateConfigInput;
    if (body.target_base_url) {
      body.target_base_url = body.target_base_url.replace(/\/$/, "");
      if (!isValidHttpUrl(body.target_base_url)) {
        return Response.json(
          { error: "target_base_url must be a valid http(s) URL" },
          { status: 400 }
        );
      }
    }
    const updated = await updateConfig(id, body);
    if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(updated);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "configs:delete", 20);
  if (limited) return limited;

  try {
    const { id } = await params;
    await deleteConfig(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
