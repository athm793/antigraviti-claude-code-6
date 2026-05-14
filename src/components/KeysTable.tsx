"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiKey } from "@/lib/types";

function maskKey(k: string): string {
  if (k.length <= 10) return k.slice(0, 3) + "••••";
  return k.slice(0, 6) + "••••••" + k.slice(-4);
}

function StatusBadge({ status }: { status: ApiKey["status"] }) {
  const styles: Record<ApiKey["status"], string> = {
    active: "bg-[#00C4B4]/15 text-[#00C4B4] border-[#00C4B4]/25",
    exhausted: "bg-red-500/15 text-red-400 border-red-500/25",
    cooldown: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function KeysTable({
  keys,
  configId,
}: {
  keys: ApiKey[];
  configId: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<number | null>(null);

  async function handleDelete(keyId: number) {
    if (!confirm("Delete this API key?")) return;
    setDeleting(keyId);
    await fetch(`/api/configs/${configId}/keys/${keyId}`, { method: "DELETE" });
    setDeleting(null);
    router.refresh();
  }

  if (keys.length === 0) {
    return (
      <div className="text-center py-12 text-[#8b8b9e]">
        No keys yet. Add some above.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2a2a38] text-[#8b8b9e] text-left">
            <th className="pb-3 pr-4 font-medium w-12">#</th>
            <th className="pb-3 pr-4 font-medium font-mono">Key</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 pr-4 font-medium text-right">Requests</th>
            <th className="pb-3 pr-4 font-medium">Exhausted At</th>
            <th className="pb-3 font-medium w-10"></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr
              key={key.id}
              className="border-b border-[#1a1a28] hover:bg-[#0d0d15] transition-colors"
            >
              <td className="py-3 pr-4 text-[#8b8b9e]">{key.order_index}</td>
              <td className="py-3 pr-4 font-mono text-[#c8c8d8]">
                {maskKey(key.key_value)}
              </td>
              <td className="py-3 pr-4">
                <StatusBadge status={key.status} />
              </td>
              <td className="py-3 pr-4 text-right text-[#8b8b9e]">
                {key.request_count.toLocaleString()}
              </td>
              <td className="py-3 pr-4 text-[#8b8b9e] text-xs">
                {key.exhausted_at
                  ? new Date(key.exhausted_at).toLocaleString()
                  : "—"}
              </td>
              <td className="py-3">
                <button
                  onClick={() => handleDelete(key.id)}
                  disabled={deleting === key.id}
                  className="text-[#8b8b9e] hover:text-red-400 transition-colors text-xs px-1.5 py-1 rounded"
                  title="Delete key"
                >
                  {deleting === key.id ? "…" : "✕"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
