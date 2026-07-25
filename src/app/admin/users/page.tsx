import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listUsers } from "@/lib/usersDb";
import { UsersManager } from "@/components/UsersManager";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!currentUser.is_admin) redirect("/");

  const users = await listUsers();

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      <div>
        <a href="/" className="text-[#8b8b9e] hover:text-white text-sm transition-colors min-h-[44px] inline-flex items-center">
          ← Back
        </a>
        <h1 className="text-2xl font-bold text-white mt-3">Manage Users</h1>
        <p className="text-[#8b8b9e] text-sm mt-1 leading-relaxed">
          Admins can create accounts for teammates, reset passwords, and grant
          or revoke admin access. Everyone sees and manages only the providers
          and endpoints they created; admins see everything. KeyProxy always
          keeps at least one admin, so the last admin can&apos;t be demoted or
          deleted.
        </p>
      </div>

      <UsersManager initialUsers={users} currentUserId={currentUser.id} />
    </div>
  );
}
