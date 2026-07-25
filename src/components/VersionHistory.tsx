"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EndpointVersion } from "@/lib/endpointTypes";
import { ConfirmModal } from "./ConfirmModal";
import { Spinner, RefreshCw } from "./ui/Icon";
import { formatDateTime } from "@/lib/format";
import {
  badgeBase,
  badgeTones,
  btnSecondary,
  cardCls,
  errorBoxCls,
  hintCls,
  numericCls,
} from "@/lib/ui";

type VersionRow = Pick<EndpointVersion, "id" | "version_no" | "note" | "created_at"> & {
  step_count: number;
};

/**
 * Version history with restore.
 *
 * Restoring writes the old definition forward as a new version rather than
 * pointing back at the old row — history stays append-only, and undoing a
 * restore is just another restore. The row says that in its note.
 */
export function VersionHistory({
  endpointId,
  revision,
  activeVersionId,
  versions,
}: {
  endpointId: string;
  revision: number;
  activeVersionId: string | null;
  versions: VersionRow[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<VersionRow | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function restore(version: VersionRow) {
    setConfirming(null);
    setRestoring(version.id);
    setError("");
    try {
      const res = await fetch(`/api/endpoints/${endpointId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: version.id, expected_revision: revision }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not restore that version");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setRestoring(null);
    }
  }

  if (versions.length === 0) return null;

  return (
    <div className={cardCls}>
      <div>
        <h2 className="text-base font-semibold text-white">Version history</h2>
        <p className={hintCls}>
          Every save is kept. Restoring copies an old version forward — nothing is ever
          overwritten, so a restore can itself be undone.
        </p>
      </div>

      <div className="flex flex-col">
        {versions.map((version) => {
          const isActive = version.id === activeVersionId;
          return (
            <div
              key={version.id}
              className="flex items-center gap-3 min-h-[52px] border-b border-[#1a1a28] last:border-0"
            >
              <span className={`text-sm text-white w-12 shrink-0 ${numericCls}`}>
                v{version.version_no}
              </span>
              <span className="text-xs text-[#8b8b9e] tabular-nums w-40 shrink-0 hidden sm:block">
                {formatDateTime(version.created_at)}
              </span>
              <span className={`text-xs text-[#8b8b9e] w-16 shrink-0 hidden sm:block ${numericCls}`}>
                {version.step_count} step{version.step_count === 1 ? "" : "s"}
              </span>
              <span className="text-xs text-[#8b8b9e] truncate min-w-0 flex-1">
                {version.note ?? ""}
              </span>

              {/* One fixed-width slot: either the Live badge or the restore
                  button, so rows all line up and nothing jumps. */}
              <div className="w-28 shrink-0 flex justify-end">
                {isActive ? (
                  <span className={`${badgeBase} ${badgeTones.brand} w-full justify-center`}>
                    Live
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(version)}
                    disabled={restoring !== null}
                    className={`${btnSecondary} gap-1.5 w-full !min-h-[36px] text-xs`}
                  >
                    {restoring === version.id ? (
                      <Spinner className="w-3.5 h-3.5" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Restore
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className={errorBoxCls}>{error}</p>}

      <ConfirmModal
        open={confirming !== null}
        title={`Restore v${confirming?.version_no ?? ""}`}
        message={
          confirming
            ? `Make v${confirming.version_no} the live definition? The current one stays in the history, and any cached answers go cold automatically.`
            : ""
        }
        confirmLabel="Restore"
        onConfirm={() => confirming && restore(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
