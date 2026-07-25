import { type NextRequest } from "next/server";
import { listConfigs, createConfig } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkPublicHttpTarget, normalizeRateLimitCodes } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rateLimit";
import type { CreateConfigInput } from "@/lib/types";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }
    const configs = await listConfigs(user);
    return Response.json(configs);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "configs:create", 20);
  if (limited) return limited;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = (await req.json()) as Partial<CreateConfigInput>;

    if (!body.name || !body.target_base_url) {
      return Response.json(
        { error: "name and target_base_url are required" },
        { status: 400 }
      );
    }

    const targetBaseUrl = body.target_base_url.replace(/\/$/, "");
    const check = checkPublicHttpTarget(targetBaseUrl);
    if (!check.ok) {
      return Response.json({ error: check.message }, { status: 400 });
    }

    const rateLimitCodes = normalizeRateLimitCodes(body.rate_limit_codes ?? [429]);
    if (!rateLimitCodes) {
      return Response.json(
        { error: "Rate limit codes must be HTTP status codes between 400 and 599" },
        { status: 400 }
      );
    }

    const config = await createConfig(
      {
        name: body.name,
        target_base_url: targetBaseUrl,
        auth_header_name: body.auth_header_name ?? "Authorization",
        auth_header_prefix: body.auth_header_prefix ?? "Bearer ",
        rate_limit_codes: rateLimitCodes,
        cooldown_minutes: body.cooldown_minutes ?? 0,
      },
      user.id
    );

    return Response.json(config, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
