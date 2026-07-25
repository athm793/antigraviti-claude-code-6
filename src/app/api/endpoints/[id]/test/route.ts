import { type NextRequest } from "next/server";
import { authorizeEndpoint, configAuthResponse } from "@/lib/auth";
import { checkStepProviders } from "@/lib/endpointGuards";
import { validateEndpointDefinition } from "@/lib/engine/validate";
import { validateRunInput } from "@/lib/engine/input";
import { executeEndpointRun, HARD_DEADLINE_MS } from "@/lib/runner";
import { checkRateLimit } from "@/lib/rateLimit";
import type { EndpointDefinition } from "@/lib/endpointTypes";

/**
 * Runs the draft currently open in the builder, without saving it.
 *
 * Testing the *saved* version would make the loop useless: you'd have to
 * publish a change to find out whether it works, and every experiment would
 * land in the run log and skew the hit rates the whole feature exists to
 * produce. So this takes the definition from the request body, and persists
 * nothing.
 *
 * It does spend real credits — these are live calls to real providers. The UI
 * says so before you press the button.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Session-authenticated, so the in-memory limiter is the right tool here —
  // it's the same shape as any other dashboard button.
  const limited = checkRateLimit(req, "endpoints:test", 30);
  if (limited) return limited;

  const { id } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) return configAuthResponse(auth.status);

  let body: { definition?: EndpointDefinition; input?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  if (!body.definition || typeof body.definition !== "object") {
    return Response.json({ error: "No definition supplied" }, { status: 400 });
  }

  const validated = validateEndpointDefinition(body.definition);
  if (!validated.ok) {
    return Response.json(
      { error: "Fix the highlighted problems first", issues: validated.issues },
      { status: 400 }
    );
  }

  const definition = validated.value;
  if ((definition.steps ?? []).length === 0) {
    return Response.json({ error: "Add a step first" }, { status: 400 });
  }

  // The draft is caller-supplied, so the provider ids in it are too — this is
  // the same escalation the save route guards, and it has to be checked here
  // independently since nothing was saved.
  const providers = await checkStepProviders(auth.user, definition);
  if (!providers.ok) {
    return Response.json({ error: providers.message }, { status: 403 });
  }

  const input = validateRunInput(definition.inputs ?? [], body.input ?? {});
  if (!input.ok) {
    return Response.json(
      { error: "Check the test values", details: input.errors },
      { status: 400 }
    );
  }

  try {
    const result = await executeEndpointRun({
      definition,
      input: input.value,
      deadlineMs: Math.min(auth.endpoint.run_deadline_ms, HARD_DEADLINE_MS),
      // On for a test run regardless of the endpoint's logging setting: this is
      // the author looking at their own providers, and seeing the actual
      // response is the entire point. Nothing here is written to the database.
      includeBodies: true,
    });

    return Response.json({ result }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[test-run] unexpected failure", id, err);
    return Response.json({ error: "The test run failed unexpectedly" }, { status: 500 });
  }
}
