"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "./ConfirmModal";
import { CopyButton } from "./ui/CopyButton";
import { Eye, EyeOff, RefreshCw, Spinner } from "./ui/Icon";
import { cardCls, metaLabelCls } from "@/lib/ui";

export function MasterKeyDisplay({
  configId,
  masterKey,
}: {
  configId: string;
  masterKey: string;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rotating, setRotating] = useState(false);

  const displayed = visible
    ? masterKey
    : `${masterKey.slice(0, 8)}••••••••••••••••${masterKey.slice(-4)}`;

  async function rotate() {
    setConfirmOpen(false);
    setRotating(true);
    setError("");
    try {
      const res = await fetch(`/api/configs/${configId}/rotate-key`, { method: "POST" });
      if (!res.ok) throw new Error("Request failed");
      setVisible(true);
      router.refresh();
    } catch {
      setError("Failed to rotate master key — try again");
    } finally {
      setRotating(false);
    }
  }

  const chipCls =
    "text-xs transition-colors px-3 min-h-[44px] rounded border inline-flex items-center gap-1.5";

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between gap-3">
        <span className={metaLabelCls}>Master key</span>
        <span className="text-xs text-[#8b8b9e]">
          Use this as your <code className="text-[#00C4B4]">x-master-key</code> header
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-3">
        <code className="flex-1 min-w-full sm:min-w-0 text-sm font-mono text-[#c8c8d8] break-all">
          {displayed}
        </code>
        {/* Wraps rather than shrink-0: three 44px-tall controls plus the key
            don't fit on one line at 375px, and shrink-0 pushed them past the
            viewport instead of dropping to their own row. */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide master key" : "Show master key"}
            className={`${chipCls} text-[#8b8b9e] hover:text-white border-[#2a2a38] hover:border-[#363650]`}
          >
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="min-w-[2.5rem] text-left">{visible ? "Hide" : "Show"}</span>
          </button>
          <CopyButton
            value={masterKey}
            ariaLabel="Copy master key"
            className={`${chipCls} border-[#00C4B4]/20 hover:border-[#00C4B4]/40`}
          />
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={rotating}
            aria-label="Rotate master key"
            className={`${chipCls} text-amber-400 hover:text-white border-amber-400/20 hover:border-amber-400/40 disabled:opacity-50`}
          >
            {rotating ? (
              <Spinner className="w-3.5 h-3.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span className="min-w-[3.5rem] text-left">
              {rotating ? "Rotating…" : "Rotate"}
            </span>
          </button>
        </div>
      </div>
      <p className="text-red-400 text-xs min-h-[16px]">{error}</p>

      <ConfirmModal
        open={confirmOpen}
        title="Rotate master key"
        message="This generates a new master key and immediately invalidates the current one. Any client app using the old key will stop working until you update it. Continue?"
        confirmLabel="Rotate"
        onConfirm={rotate}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
