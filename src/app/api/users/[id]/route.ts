import { type NextRequest } from "next/server";
import { getUserById, updateUser, deleteUser, countAdmins } from "@/lib/usersDb";
import { requireAdmin } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const limited = checkRateLimit(req, "users:update", 30);
  if (limited) return limited;

  try {
    const { id } = await params;
    const target = await getUserById(id);
    if (!target) return Response.json({ error: "User not found" }, { status: 404 });

    const body = (await req.json()) as { name?: string; password?: string; isAdmin?: boolean };

    if (body.password && body.password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    if (body.isAdmin === false && target.is_admin) {
      const admins = await countAdmins();
      if (admins <= 1) {
        return Response.json({ error: "Cannot remove the last admin" }, { status: 400 });
      }
    }

    const updated = await updateUser(id, body);
    return Response.json(updated);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const limited = checkRateLimit(req, "users:delete", 10);
  if (limited) return limited;

  try {
    const { id } = await params;

    if (id === admin.id) {
      return Response.json({ error: "You cannot delete your own account" }, { status: 400 });
    }

    const target = await getUserById(id);
    if (!target) return Response.json({ error: "User not found" }, { status: 404 });

    if (target.is_admin) {
      const admins = await countAdmins();
      if (admins <= 1) {
        return Response.json({ error: "Cannot delete the last admin" }, { status: 400 });
      }
    }

    await deleteUser(id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
