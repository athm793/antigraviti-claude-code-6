"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfigWithStats } from "@/lib/types";

export function ConfigCard({ config }: { config: ConfigWithStats }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function copyKey() {
    await navigator.clipboard.writeText(config.master_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${config.name}"? This will also delete all its keys.`)) return;
    setDeleting(true);
    await fetch(`/api/configs/${config.id}`, { method: "DELETE" });
    router.refresh();
  }

  const maskedKey =
    config.master_key.slice(0, 8) + "••••••••" + config.master_key.slice(-4);

  return (
    <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-5 flex flex-col gap-4 hover:border-[#363650] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-white font-semibold text-base">{config.name}</h2>
          <p className="text-[#8b8b9e] text-xs mt-0.5 font-mono truncate max-w-[240px]">
            {config.target_base_url}
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-[#8b8b9e] hover:text-red-400 transition-colors text-sm px-2 py-1 rounded"
          title="Delete config"
        >
          {deleting ? "…" : "✕"}
        </button>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 text-center bg-[#0a0a10] rounded-lg py-2">
          <div className="text-[#00C4B4] font-bold text-xl">{config.stats.active}</div>
          <div className="text-[#8b8b9e] text-xs">Active</div>
        </div>
        <div className="flex-1 text-center bg-[#0a0a10] rounded-lg py-2">
          <div className="text-red-400 font-bold text-xl">{config.stats.exhausted}</div>
          <div className="text-[#8b8b9e] text-xs">Exhausted</div>
        </div>
        <div className="flex-1 text-center bg-[#0a0a10] rounded-lg py-2">
          <div className="text-amber-400 font-bold text-xl">{config.stats.cooldown}</div>
          <div className="text-[#8b8b9e] text-xs">Cooldown</div>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-[#0a0a10] rounded-lg px-3 py-2">
        <code className="text-[#8b8b9e] text-xs font-mono flex-1 truncate">
          {maskedKey}
        </code>
        <button
          onClick={copyKey}
          className="text-xs text-[#00C4B4] hover:text-white transition-colors shrink-0"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <a
        href={`/configs/${config.id}`}
        className="block text-center text-sm bg-[#00C4B4]/10 hover:bg-[#00C4B4]/20 text-[#00C4B4] border border-[#00C4B4]/20 rounded-lg py-2 transition-colors"
      >
        Manage Keys →
      </a>
    </div>
  );
}
