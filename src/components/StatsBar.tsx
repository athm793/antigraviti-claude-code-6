"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KeyStats } from "@/lib/types";
import { ConfirmModal } from "./ConfirmModal";

export function StatsBar({
  stats,
  configId,
}: {
  stats: KeyStats;
  configId: string;
}) {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleReset() {
    setConfirmOpen(false);
    setResetting(true);
    setError("");
    try {
      const res = await fetch(`/api/configs/${configId}/reset`, { method: "POST" });
      if (!res.ok) throw new Error("Request failed");
      router.refresh();
    } catch {
      setError("Failed to reset keys — try again");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex gap-3 flex-1 min-w-0">
        <Stat label="Active" value={stats.active} color="text-[#00C4B4]" />
        <Stat label="Exhausted" value={stats.exhausted} color="text-red-400" />
        <Stat label="Cooldown" value={stats.cooldown} color="text-amber-400" />
        <Stat label="Total" value={stats.total} color="text-[#8b8b9e]" />
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {(stats.exhausted > 0 || stats.cooldown > 0) && (
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={resetting}
          className="text-sm text-[#8b8b9e] hover:text-white border border-[#2a2a38] hover:border-[#363650] px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {resetting ? "Resetting…" : "Reset All Keys"}
        </button>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Reset all keys"
        message="Reset all exhausted and cooldown keys back to active?"
        confirmLabel="Reset"
        onConfirm={handleReset}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-2 text-center min-w-[70px]">
      <div className={`${color} font-bold text-lg`}>{value}</div>
      <div className="text-[#8b8b9e] text-xs">{label}</div>
    </div>
  );
}
