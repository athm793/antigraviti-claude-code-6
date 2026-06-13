"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/types";

export function UserMenu({ user }: { user: User | null }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  async function handleLogout() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      <span className="text-[#8b8b9e] hidden sm:inline" title={user.email}>
        {user.name || user.email}
        {user.is_admin && (
          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[#00C4B4] bg-[#00C4B4]/15 px-1.5 py-0.5 rounded-full">
            Admin
          </span>
        )}
      </span>
      {user.is_admin && (
        <a
          href="/admin/users"
          className="text-[#c8c8d8] hover:text-white transition-colors min-h-[44px] inline-flex items-center"
        >
          Manage Users
        </a>
      )}
      <button
        onClick={handleLogout}
        disabled={signingOut}
        className="text-[#c8c8d8] hover:text-white border border-[#2a2a38] hover:border-[#363650] rounded-lg px-3 min-h-[44px] transition-colors disabled:opacity-50"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
