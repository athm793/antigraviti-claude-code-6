import { type NextRequest } from "next/server";
import {
  updateEndpointSettings,
  deleteEndpoint,
  getEndpointBySlug,
  getActiveDefinition,
  normalizeSlug,
  isValidSlug,
} from "@/lib/endpointsDb";
import { authorizeEndpoint, configAuthResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { id: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeEndpoint(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    const { definition, version } = await getActiveDefinition(auth.endpoint);
    return Response.json({
      ...auth.endpoint,
      definition,
      version_no: version?.version_no ?? 0,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "endpoints:update", 30);
  if (limited) return limited;

  try {
    const { id } = await params;
    const auth = await authorizeEndpoint(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    const body = (await req.json()) as Record<string, unknown>;
    const patch: Parameters<typeof updateEndpointSettings>[1] = {};

    if (typeof body.name === "string") {
      if (!body.name.trim()) {
        return Response.json({ error: "Give the endpoint a name" }, { status: 400 });
      }
      patch.name = body.name.trim();
    }

    if (typeof body.slug === "string") {
      const slug = normalizeSlug(body.slug);
      if (!isValidSlug(slug)) {
        return Response.json(
          { error: "The URL name must be 2–60 characters, using lowercase letters, numbers and hyphens" },
          { status: 400 }
        );
      }
      if (slug !== auth.endpoint.slug) {
        const clash = await getEndpointBySlug(slug);
        if (clash) {
          return Response.json({ error: `The URL name "${slug}" is already taken` }, { status: 409 });
        }
      }
      patch.slug = slug;
    }

    if (typeof body.description === "string") patch.description = body.description.trim();
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.cache_enabled === "boolean") patch.cache_enabled = body.cache_enabled;
    if (typeof body.log_bodies === "boolean") patch.log_bodies = body.log_bodies;

    const numeric: [string, keyof typeof patch, number, number][] = [
      ["cache_ttl_seconds", "cache_ttl_seconds", 0, 60 * 60 * 24 * 30],
      ["run_deadline_ms", "run_deadline_ms", 1000, 50_000],
      ["log_retention_days", "log_retention_days", 1, 365],
      // 0 disables the limit. The ceiling is a backstop, not a target: each run
      // buys upstream calls, so this is a spend control.
      ["rate_limit_per_minute", "rate_limit_per_minute", 0, 10_000],
    ];
    for (const [key, field, min, max] of numeric) {
      const raw = body[key];
      if (raw === undefined) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < min || n > max) {
        return Response.json(
          { error: `${key.replace(/_/g, " ")} must be between ${min} and ${max}` },
          { status: 400 }
        );
      }
      (patch as Record<string, unknown>)[field] = Math.round(n);
    }

    const updated = await updateEndpointSettings(id, patch);
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
  const limited = checkRateLimit(req, "endpoints:delete", 20);
  if (limited) return limited;

  try {
    const { id } = await params;
    const auth = await authorizeEndpoint(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    await deleteEndpoint(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
