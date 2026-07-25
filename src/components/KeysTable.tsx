"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiKeyView, KeyStatus } from "@/lib/types";
import { ConfirmModal } from "./ConfirmModal";
import { Trash, Spinner } from "./ui/Icon";
import {
  badgeBase,
  badgeTones,
  btnIconDanger,
  tableHeadRowCls,
  tableRowCls,
  tableTdCls,
  tableThCls,
} from "@/lib/ui";

function StatusBadge({ status }: { status: KeyStatus }) {
  const tone = {
    active: badgeTones.brand,
    exhausted: badgeTones.danger,
    cooldown: badgeTones.warning,
  }[status];
  // Fixed width: "active" and "exhausted" differ by four characters, and
  // without this the Requests column shifts as keys change state.
  return (
    <span className={`${badgeBase} ${tone} min-w-[5.5rem] justify-center`}>{status}</span>
  );
}

export function KeysTable({
  keys,
  configId,
}: {
  keys: ApiKeyView[];
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
          <tr className={tableHeadRowCls}>
            {/*
              Widths are pinned on every short column so the slack lands in
              "Exhausted at", which actually holds a long value. Left flexible,
              the Key column stretched and left a gap before Status — key
              previews are only a few characters now.
            */}
            <th scope="col" className={`${tableThCls} w-12`}>#</th>
            <th scope="col" className={`${tableThCls} w-40`}>Key</th>
            <th scope="col" className={`${tableThCls} w-32`}>Status</th>
            <th scope="col" className={`${tableThCls} text-right w-28`}>Requests</th>
            <th scope="col" className={tableThCls}>Exhausted at</th>
            <th scope="col" className="pb-3 font-medium w-10">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id} className={tableRowCls}>
              <td className={`${tableTdCls} text-[#8b8b9e] tabular-nums`}>
                {key.order_index}
              </td>
              <td className={`${tableTdCls} font-mono text-[#c8c8d8]`}>
                {key.key_preview}
              </td>
              <td className={tableTdCls}>
                <StatusBadge status={key.status} />
              </td>
              <td className={`${tableTdCls} text-right text-[#8b8b9e] tabular-nums`}>
                {key.request_count.toLocaleString()}
              </td>
              <td className={`${tableTdCls} text-[#8b8b9e] text-xs tabular-nums`}>
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
                  className={btnIconDanger}
                >
                  {deleting === key.id ? (
                    <Spinner className="w-4 h-4" />
                  ) : (
                    <Trash className="w-4 h-4" />
                  )}
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
