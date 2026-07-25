"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "./ConfirmModal";
import { Spinner, Database } from "./ui/Icon";
import { btnSecondary, cardCls, errorBoxCls, hintCls } from "@/lib/ui";
import { formatNumber } from "@/lib/format";

/**
 * Clearing cached answers by hand.
 *
 * Editing any step already invalidates them on its own, because the version id
 * is part of the cache key. This exists for the case that doesn't cover: the
 * *provider's* data changed and your definition didn't.
 */
export function CachePanel({
  endpointId,
  enabled,
  cached,
}: {
  endpointId: string;
  enabled: boolean;
  cached: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [cleared, setCleared] = useState<number | null>(null);

  async function clear() {
    setConfirming(false);
    setClearing(true);
    setError("");
    try {
      const res = await fetch(`/api/endpoints/${endpointId}/cache`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not clear the cache");
        return;
      }
      const data = await res.json();
      setCleared(data.cleared as number);
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">Cached answers</h2>
          <p className={hintCls}>
            {!enabled
              ? "Caching is off for this endpoint, so every call pays for itself."
              : cached === 0
                ? "Nothing cached yet. Answers are stored as runs succeed."
                : `${formatNumber(cached)} answer${cached === 1 ? "" : "s"} stored. Editing any step clears them automatically — this is for when the provider's data changed and yours didn't.`}
          </p>
        </div>

        {/* The confirmation sits beside the button in a reserved slot rather
            than on its own line below — an empty line there is a visible band
            of nothing for the entire time no cache has been cleared. */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[#00C4B4] text-sm text-right min-w-[8rem]">
            {cleared !== null && !clearing
              ? `Cleared ${formatNumber(cleared)}`
              : ""}
          </span>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={clearing || cached === 0}
            className={`${btnSecondary} gap-2`}
          >
            {clearing ? <Spinner className="w-4 h-4" /> : <Database className="w-4 h-4" />}
            {clearing ? "Clearing…" : "Clear cache"}
          </button>
        </div>
      </div>

      {error && <p className={errorBoxCls}>{error}</p>}

      <ConfirmModal
        open={confirming}
        title="Clear cached answers"
        message={`Delete ${formatNumber(cached)} cached answer${cached === 1 ? "" : "s"}? The next call for each of them will pay the providers again.`}
        confirmLabel="Clear cache"
        onConfirm={clear}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
