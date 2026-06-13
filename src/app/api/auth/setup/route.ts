import { type NextRequest } from "next/server";
import { countUsers, createUser } from "@/lib/usersDb";
import { setSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "auth:setup", 5);
  if (limited) return limited;

  try {
    const existing = await countUsers();
    if (existing > 0) {
      return Response.json({ error: "Setup has already been completed" }, { status: 403 });
    }

    const body = (await req.json()) as { email?: string; password?: string; name?: string };

    if (!body.email || !body.password) {
      return Response.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (body.password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const user = await createUser({
      email: body.email,
      password: body.password,
      name: body.name,
      isAdmin: true,
    });

    await setSessionCookie(user.id);

    return Response.json({ user }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
