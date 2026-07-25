import { listConfigs } from "./db";
import type { EndpointDefinition } from "./endpointTypes";
import type { User } from "./types";

/**
 * A definition names providers by id in a JSONB blob, with no foreign key and
 * no join to enforce anything. Nothing about saving one proves the author is
 * allowed to use the providers it points at.
 *
 * Without this check, anyone with an account can write a step carrying someone
 * else's config id, then call their own public endpoint — and the run spends
 * that person's API keys and returns them whatever their provider replied.
 * Ownership is checked at the seam where the ids enter the system.
 */
export async function checkStepProviders(
  user: User,
  definition: EndpointDefinition
): Promise<{ ok: true } | { ok: false; message: string }> {
  const referenced = [
    ...new Set(
      (definition.steps ?? [])
        .map((step) => step?.config_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (referenced.length === 0) return { ok: true };

  const allowed = new Set((await listConfigs(user)).map((config) => config.id));
  const denied = referenced.filter((id) => !allowed.has(id));

  if (denied.length === 0) return { ok: true };

  return {
    ok: false,
    // Says "isn't available" rather than "belongs to someone else" — the same
    // wording covers a deleted provider and one that was never yours, so the
    // message can't be used to test whether an id exists.
    message:
      denied.length === 1
        ? "One of the steps uses a provider that isn't available to you."
        : `${denied.length} steps use providers that aren't available to you.`,
  };
}
