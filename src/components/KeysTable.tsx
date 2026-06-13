"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiKey } from "@/lib/types";
import { ConfirmModal } from "./ConfirmModal";

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
  const [error, setError] = useState("");
  const [confirmKeyId, setConfirmKeyId] = useState<number | null>(null);

  async function handleDelete(keyId: number) {
    setConfirmKeyId(null);
    setDeleting(keyId);
    setError("");
    try {
      const res = await fetch(`/api/configs/${configId}/keys/${keyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Request failed");
      router.refresh();
    } catch {
      setError("Failed to delete key — try again");
    } finally {
      setDeleting(null);
    }
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
      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
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
                  onClick={() => setConfirmKeyId(key.id)}
                  disabled={deleting === key.id}
                  aria-label={`Delete key ${key.order_index}`}
                  title="Delete key"
                  className="text-[#8b8b9e] hover:text-red-400 transition-colors text-xs min-w-[44px] min-h-[44px] flex items-center justify-center rounded"
                >
                  {deleting === key.id ? "…" : "✕"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConfirmModal
        open={confirmKeyId !== null}
        title="Delete key"
        message="Delete this API key? This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmKeyId !== null && handleDelete(confirmKeyId)}
        onCancel={() => setConfirmKeyId(null)}
      />
    </div>
  );
}
