import { type NextRequest } from "next/server";
import {
  listEndpoints,
  createEndpoint,
  getEndpointBySlug,
  normalizeSlug,
  isValidSlug,
} from "@/lib/endpointsDb";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { emptyDefinition, type EndpointDefinition } from "@/lib/endpointTypes";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }
    const endpoints = await listEndpoints(user);
    return Response.json(endpoints);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "endpoints:create", 20);
  if (limited) return limited;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = (await req.json()) as {
      name?: string;
      slug?: string;
      description?: string;
      definition?: EndpointDefinition;
    };

    if (!body.name?.trim()) {
      return Response.json({ error: "Give the endpoint a name" }, { status: 400 });
    }

    const slug = normalizeSlug(body.slug?.trim() || body.name);
    if (!isValidSlug(slug)) {
      return Response.json(
        { error: "The URL name must be 2–60 characters, using lowercase letters, numbers and hyphens" },
        { status: 400 }
      );
    }

    const clash = await getEndpointBySlug(slug);
    if (clash) {
      return Response.json(
        { error: `The URL name "${slug}" is already taken` },
        { status: 409 }
      );
    }

    const { endpoint, key } = await createEndpoint({
      name: body.name.trim(),
      slug,
      description: body.description?.trim(),
      ownerUserId: user.id,
      definition: body.definition ?? emptyDefinition(),
    });

    // The plaintext key is returned exactly once, here. It is stored hashed,
    // so there is no way to show it again later.
    return Response.json({ ...endpoint, key }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
