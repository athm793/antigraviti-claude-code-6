"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EndpointKeyRecord } from "@/lib/endpointTypes";
import { keyHint } from "@/lib/endpointKeyFormat";
import { formatDate } from "@/lib/format";
import { ConfirmModal } from "./ConfirmModal";
import { CopyButton } from "./ui/CopyButton";
import { Plus, Trash, Spinner, AlertTriangle } from "./ui/Icon";
import {
  badgeBase,
  badgeTones,
  btnSecondary,
  btnIconDanger,
  cardCls,
  errorBoxCls,
  hintCls,
  inputCls,
} from "@/lib/ui";

export function EndpointKeysManager({
  endpointId,
  keys,
}: {
  endpointId: string;
  keys: EndpointKeyRecord[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{ plaintext: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<EndpointKeyRecord | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/endpoints/${endpointId}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create key");
        return;
      }
      setIssued(await res.json());
      setLabel("");
      setCreating(false);
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(record: EndpointKeyRecord) {
    setConfirmRevoke(null);
    setRevoking(record.id);
    setError("");
    try {
      const res = await fetch(`/api/endpoints/${endpointId}/keys/${record.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to revoke key");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setRevoking(null);
    }
  }

  const live = keys.filter((k) => !k.revoked_at);

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">Keys</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className={`${btnSecondary} gap-1.5`}>
            <Plus className="w-4 h-4" />
            New key
          </button>
        )}
      </div>

      <p className={hintCls}>
        Callers send one of these as an <code className="text-[#00C4B4]">x-endpoint-key</code>{" "}
        header. Only a one-way hash of each key is stored, so a key can only be seen once, when it&apos;s created.
      </p>

      {issued && (
        <div className="bg-[#00C4B4]/[0.06] border border-[#00C4B4]/25 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Copy this now — it can&apos;t be shown again.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-3 py-2">
            <code className="flex-1 min-w-full sm:min-w-0 text-xs font-mono text-[#c8c8d8] break-all">
              {issued.plaintext}
            </code>
            <CopyButton value={issued.plaintext} ariaLabel="Copy new endpoint key" />
          </div>
          <button
            onClick={() => setIssued(null)}
            className="text-[#8b8b9e] hover:text-white text-xs self-start min-h-[44px]"
          >
            I&apos;ve saved it — hide this
          </button>
        </div>
      )}

      {creating && (
        <form onSubmit={createKey} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]">
            <label htmlFor="key-label" className={hintCls}>
              Label — what will use this key?
            </label>
            <input
              id="key-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Clay table"
              className={`${inputCls} mt-1`}
            />
          </div>
          <button type="submit" disabled={busy} className={`${btnSecondary} gap-2 min-w-[8rem]`}>
            {busy && <Spinner className="w-4 h-4" />}
            {busy ? "Creating…" : "Create key"}
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="text-sm text-[#8b8b9e] hover:text-white px-3 min-h-[44px]"
          >
            Cancel
          </button>
        </form>
      )}

      {error && <p className={errorBoxCls}>{error}</p>}

      {keys.length === 0 ? (
        <p className="text-[#8b8b9e] text-sm">No keys yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((record) => (
            <li
              key={record.id}
              className="flex items-center gap-3 bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-3 min-h-[56px]"
            >
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm truncate">
                  {record.label || "Untitled key"}
                </div>
                <code className="text-[#8b8b9e] text-xs font-mono">
                  {keyHint(record.key_id)}
                </code>
              </div>
              <span className="text-[#8b8b9e] text-xs tabular-nums hidden sm:block w-32 text-right">
                {record.last_used_at
                  ? `used ${formatDate(record.last_used_at)}`
                  : "never used"}
              </span>
              <span
                className={`${badgeBase} ${record.revoked_at ? badgeTones.danger : badgeTones.brand} min-w-[4.5rem] justify-center`}
              >
                {record.revoked_at ? "Revoked" : "Active"}
              </span>
              <button
                onClick={() => setConfirmRevoke(record)}
                disabled={Boolean(record.revoked_at) || revoking === record.id}
                aria-label={`Revoke key ${record.label || record.key_id}`}
                data-tip={record.revoked_at ? "Already revoked" : "Revoke key"}
                className={`${btnIconDanger} disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {revoking === record.id ? (
                  <Spinner className="w-4 h-4" />
                ) : (
                  <Trash className="w-4 h-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={confirmRevoke !== null}
        title="Revoke key"
        message={
          live.length <= 1
            ? "This is the only working key. Revoking it will stop every call to this endpoint until you create a new one."
            : "Anything using this key will stop working immediately. This can't be undone."
        }
        confirmLabel="Revoke"
        onConfirm={() => confirmRevoke && revoke(confirmRevoke)}
        onCancel={() => setConfirmRevoke(null)}
      />
    </div>
  );
}
