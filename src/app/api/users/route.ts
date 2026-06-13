import { type NextRequest } from "next/server";
import { listUsers, createUser, getUserByEmail } from "@/lib/usersDb";
import { requireAdmin } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const users = await listUsers();
    return Response.json(users);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const limited = checkRateLimit(req, "users:create", 20);
  if (limited) return limited;

  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
      isAdmin?: boolean;
    };

    if (!body.email || !body.password) {
      return Response.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (body.password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const existing = await getUserByEmail(body.email);
    if (existing) {
      return Response.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const user = await createUser({
      email: body.email,
      password: body.password,
      name: body.name,
      isAdmin: body.isAdmin ?? false,
    });

    return Response.json(user, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
