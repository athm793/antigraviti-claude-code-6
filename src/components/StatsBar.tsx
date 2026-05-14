"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KeyStats } from "@/lib/types";

export function StatsBar({
  stats,
  configId,
}: {
  stats: KeyStats;
  configId: string;
}) {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    if (!confirm("Reset all exhausted and cooldown keys back to active?")) return;
    setResetting(true);
    await fetch(`/api/configs/${configId}/reset`, { method: "POST" });
    setResetting(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex gap-3 flex-1 min-w-0">
        <Stat label="Active" value={stats.active} color="text-[#00C4B4]" />
        <Stat label="Exhausted" value={stats.exhausted} color="text-red-400" />
        <Stat label="Cooldown" value={stats.cooldown} color="text-amber-400" />
        <Stat label="Total" value={stats.total} color="text-[#8b8b9e]" />
      </div>
      {(stats.exhausted > 0 || stats.cooldown > 0) && (
        <button
          onClick={handleReset}
          disabled={resetting}
          className="text-sm text-[#8b8b9e] hover:text-white border border-[#2a2a38] hover:border-[#363650] px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Reset All Keys"}
        </button>
      )}
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
