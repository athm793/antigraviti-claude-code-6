import { type NextRequest } from "next/server";
import { updateConfig, deleteConfig, getKeyStats } from "@/lib/db";
import { authorizeConfig, configAuthResponse } from "@/lib/auth";
import { checkPublicHttpTarget, normalizeRateLimitCodes } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rateLimit";
import type { UpdateConfigInput } from "@/lib/types";

type Params = { id: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeConfig(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    const stats = await getKeyStats(id);
    return Response.json({ ...auth.config, stats });
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
    const auth = await authorizeConfig(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    const body = (await req.json()) as UpdateConfigInput;

    if (body.target_base_url) {
      body.target_base_url = body.target_base_url.replace(/\/$/, "");
      const check = checkPublicHttpTarget(body.target_base_url);
      if (!check.ok) {
        return Response.json({ error: check.message }, { status: 400 });
      }
    }

    if (body.rate_limit_codes !== undefined) {
      const codes = normalizeRateLimitCodes(body.rate_limit_codes);
      if (!codes) {
        return Response.json(
          { error: "Rate limit codes must be HTTP status codes between 400 and 599" },
          { status: 400 }
        );
      }
      body.rate_limit_codes = codes;
    }

    const updated = await updateConfig(id, body, auth.config);
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
    const auth = await authorizeConfig(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    await deleteConfig(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
