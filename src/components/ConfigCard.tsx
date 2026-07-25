"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfigWithStats } from "@/lib/types";
import { ConfirmModal } from "./ConfirmModal";
import { CopyButton } from "./ui/CopyButton";
import { Trash, Spinner, ArrowRight } from "./ui/Icon";
import { btnIconDanger, btnGhostBrand, cardHoverCls } from "@/lib/ui";

export function ConfigCard({ config }: { config: ConfigWithStats }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    setConfirmOpen(false);
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/configs/${config.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to delete — try again");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to delete — try again");
    } finally {
      setDeleting(false);
    }
  }

  const maskedKey = `${config.master_key.slice(0, 8)}••••••••${config.master_key.slice(-4)}`;

  return (
    <div className={cardHoverCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-white font-semibold text-base truncate">{config.name}</h2>
          <p className="text-[#8b8b9e] text-xs mt-0.5 font-mono truncate">
            {config.target_base_url}
          </p>
        </div>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={deleting}
          aria-label={`Delete provider ${config.name}`}
          title="Delete provider"
          className={btnIconDanger}
        >
          {deleting ? <Spinner className="w-4 h-4" /> : <Trash className="w-4 h-4" />}
        </button>
      </div>

      {/* Reserved so an error appearing doesn't grow the card and reflow the grid. */}
      <p className="text-red-400 text-xs min-h-[16px]">{error}</p>

      <div className="flex gap-3">
        <Stat label="Active" value={config.stats.active} tone="text-[#00C4B4]" />
        <Stat label="Exhausted" value={config.stats.exhausted} tone="text-red-400" />
        <Stat label="Cooldown" value={config.stats.cooldown} tone="text-amber-400" />
      </div>

      <div className="flex items-center gap-2 bg-[#0a0a10] rounded-lg px-3">
        <code className="text-[#8b8b9e] text-xs font-mono flex-1 truncate">
          {maskedKey}
        </code>
        <CopyButton
          value={config.master_key}
          ariaLabel={`Copy master key for ${config.name}`}
          showLabel={false}
        />
      </div>

      <a href={`/configs/${config.id}`} className={`${btnGhostBrand} gap-1.5`}>
        Manage keys
        <ArrowRight className="w-4 h-4" />
      </a>

      <ConfirmModal
        open={confirmOpen}
        title="Delete provider"
        message={`Delete "${config.name}"? This will also delete all its keys.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex-1 text-center bg-[#0a0a10] rounded-lg py-2">
      <div className={`${tone} font-bold text-xl tabular-nums`}>{value}</div>
      <div className="text-[#8b8b9e] text-xs">{label}</div>
    </div>
  );
}
