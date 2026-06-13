import { type NextRequest } from "next/server";
import { listConfigs, createConfig } from "@/lib/db";
import { isValidHttpUrl } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rateLimit";
import type { CreateConfigInput } from "@/lib/types";

export async function GET() {
  try {
    const configs = await listConfigs();
    return Response.json(configs);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "configs:create", 20);
  if (limited) return limited;

  try {
    const body = (await req.json()) as Partial<CreateConfigInput>;

    if (!body.name || !body.target_base_url) {
      return Response.json(
        { error: "name and target_base_url are required" },
        { status: 400 }
      );
    }

    if (!isValidHttpUrl(body.target_base_url)) {
      return Response.json(
        { error: "target_base_url must be a valid http(s) URL" },
        { status: 400 }
      );
    }

    const config = await createConfig({
      name: body.name,
      target_base_url: body.target_base_url.replace(/\/$/, ""),
      auth_header_name: body.auth_header_name ?? "Authorization",
      auth_header_prefix: body.auth_header_prefix ?? "Bearer ",
      rate_limit_codes: body.rate_limit_codes ?? [429],
      cooldown_minutes: body.cooldown_minutes ?? 0,
    });

    return Response.json(config, { status: 201 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
