import { type NextRequest } from "next/server";
import { saveDefinition } from "@/lib/endpointsDb";
import { authorizeEndpoint, configAuthResponse } from "@/lib/auth";
import { checkStepProviders } from "@/lib/endpointGuards";
import { validateEndpointDefinition } from "@/lib/engine/validate";
import { checkRateLimit } from "@/lib/rateLimit";
import type { EndpointDefinition } from "@/lib/endpointTypes";

type Params = { id: string };

/**
 * Separate from PATCH /[id] on purpose: settings and the waterfall definition
 * have different validation and different failure modes, and splitting them
 * means the settings form and the builder can't clobber each other's writes.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const limited = checkRateLimit(req, "endpoints:definition", 60);
  if (limited) return limited;

  try {
    const { id } = await params;
    const auth = await authorizeEndpoint(id);
    if (!auth.ok) return configAuthResponse(auth.status);

    const body = (await req.json()) as {
      definition?: EndpointDefinition;
      expected_revision?: number;
      note?: string;
    };

    if (!body.definition || typeof body.definition !== "object") {
      return Response.json({ error: "No definition supplied" }, { status: 400 });
    }

    const expected = Number(body.expected_revision ?? auth.endpoint.revision);
    if (!Number.isInteger(expected)) {
      return Response.json({ error: "Invalid revision" }, { status: 400 });
    }

    // The same validator the builder runs against every keystroke. Sharing it
    // is the point: if the server accepted things the UI refuses (or the
    // reverse) you'd get definitions that save but can't run.
    const validated = validateEndpointDefinition(body.definition);
    if (!validated.ok) {
      return Response.json(
        {
          error: "This waterfall has problems that would stop it running",
          issues: validated.issues,
        },
        { status: 400 }
      );
    }

    const providers = await checkStepProviders(auth.user, validated.value);
    if (!providers.ok) {
      return Response.json({ error: providers.message }, { status: 403 });
    }

    const result = await saveDefinition(id, validated.value, expected, body.note);

    if (!result.ok) {
      if (result.reason === "not_found") {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      // Optimistic-lock miss: someone else saved while this draft was open.
      return Response.json(
        {
          error:
            "Someone else saved changes to this waterfall. Reload to see their version before saving again.",
          revision: result.revision,
        },
        { status: 409 }
      );
    }

    return Response.json({
      version_id: result.version.id,
      version_no: result.version.version_no,
      revision: result.revision,
      updated_at: result.version.created_at,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
