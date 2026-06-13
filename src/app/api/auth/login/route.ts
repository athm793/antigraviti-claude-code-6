import { type NextRequest } from "next/server";
import { getUserByEmail } from "@/lib/usersDb";
import { verifyPassword } from "@/lib/passwords";
import { setSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "auth:login", 10);
  if (limited) return limited;

  try {
    const body = (await req.json()) as { email?: string; password?: string };

    if (!body.email || !body.password) {
      return Response.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await getUserByEmail(body.email);
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await setSessionCookie(user.id);

    const { passwordHash, ...safeUser } = user;
    void passwordHash;
    return Response.json({ user: safeUser });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
