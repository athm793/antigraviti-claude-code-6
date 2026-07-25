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
      <span className="text-[#8b8b9e] hidden sm:inline" data-tip={user.email}>
        {user.name || user.email}
        {user.is_admin && (
          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-black bg-[#00C4B4] px-1.5 py-0.5 rounded-full">
            Admin
          </span>
        )}
      </span>
      {user.is_admin && (
        <a
          href="/admin/users"
          className="text-[#c8c8d8] hover:text-white transition-colors min-h-[44px] inline-flex items-center kp-press"
        >
          {/* Short label on phones — "Manage Users" is what pushed the header
              past the viewport at 375px. */}
          <span className="hidden sm:inline">Manage Users</span>
          <span className="sm:hidden">Users</span>
        </a>
      )}
      <button
        onClick={handleLogout}
        disabled={signingOut}
        className="text-[#c8c8d8] hover:text-white border border-[#2a2a38] hover:border-[#363650] rounded-lg px-3 min-h-[44px] transition-colors disabled:opacity-50 kp-press"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
