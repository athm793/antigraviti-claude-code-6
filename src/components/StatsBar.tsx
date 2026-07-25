"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KeyStats } from "@/lib/types";
import { ConfirmModal } from "./ConfirmModal";
import { Spinner } from "./ui/Icon";
import { btnSecondary } from "@/lib/ui";

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

  const canReset = stats.exhausted > 0 || stats.cooldown > 0;

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
    <div className="flex flex-col gap-2">
      {/*
        No flex-1 on the stats group: stretching it pinned the reset button to
        the far right with a few hundred pixels of nothing in between. The
        controls belong together at their natural width.
      */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-3 flex-wrap">
          <Stat label="Active" value={stats.active} color="text-[#00C4B4]" />
          <Stat label="Exhausted" value={stats.exhausted} color="text-red-400" />
          <Stat label="Cooldown" value={stats.cooldown} color="text-amber-400" />
          <Stat label="Total" value={stats.total} color="text-[#8b8b9e]" />
        </div>
        {/*
          Rendered always, disabled when there's nothing to reset. It used to
          mount and unmount with key state, which shifted the whole row the
          moment a key hit a rate limit.
        */}
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={resetting || !canReset}
          title={canReset ? undefined : "No exhausted or cooldown keys to reset"}
          className={`${btnSecondary} gap-2 w-[9.5rem] shrink-0`}
        >
          {resetting && <Spinner className="w-4 h-4" />}
          {resetting ? "Resetting…" : "Reset all keys"}
        </button>
      </div>
      <p className="text-red-400 text-xs min-h-[16px]">{error}</p>

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
      <div className={`${color} font-bold text-lg tabular-nums`}>{value}</div>
      <div className="text-[#8b8b9e] text-xs">{label}</div>
    </div>
  );
}
