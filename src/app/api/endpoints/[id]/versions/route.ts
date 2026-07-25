import { type NextRequest } from "next/server";
import { authorizeEndpoint, configAuthResponse } from "@/lib/auth";
import { listVersions, restoreVersion } from "@/lib/endpointsDb";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) return configAuthResponse(auth.status);

  const versions = await listVersions(id, 20);
  return Response.json({
    active_version_id: auth.endpoint.active_version_id,
    versions: versions.map((v) => ({
      id: v.id,
      version_no: v.version_no,
      note: v.note,
      step_count: v.definition.steps?.length ?? 0,
      created_at: v.created_at,
    })),
  });
}

/**
 * Restore = write the old definition forward as a new version, never point the
 * endpoint back at the old row. History stays append-only, the run log's
 * version references stay valid, and "undo the restore" is just another
 * restore.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = checkRateLimit(req, "endpoints:restore", 20);
  if (limited) return limited;

  const { id } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) return configAuthResponse(auth.status);

  let body: { version_id?: string; expected_revision?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  if (!body.version_id || typeof body.version_id !== "string") {
    return Response.json({ error: "No version supplied" }, { status: 400 });
  }

  const expected = Number(body.expected_revision ?? auth.endpoint.revision);
  const result = await restoreVersion(id, body.version_id, expected);

  if (!result.ok) {
    if (result.reason === "not_found") {
      return Response.json({ error: "That version doesn't exist" }, { status: 404 });
    }
    return Response.json(
      {
        error: "Someone else saved changes since this page loaded. Reload before restoring.",
        revision: result.revision,
      },
      { status: 409 }
    );
  }

  return Response.json({
    version_no: result.version.version_no,
    revision: result.revision,
  });
}
