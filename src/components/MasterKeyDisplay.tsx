"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "./ConfirmModal";

export function MasterKeyDisplay({
  configId,
  masterKey,
}: {
  configId: string;
  masterKey: string;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rotating, setRotating] = useState(false);

  const displayed = visible
    ? masterKey
    : masterKey.slice(0, 8) + "••••••••••••••••" + masterKey.slice(-4);

  async function copy() {
    try {
      await navigator.clipboard.writeText(masterKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy");
      setTimeout(() => setError(""), 2000);
    }
  }

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

  return (
    <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[#8b8b9e] text-xs font-medium uppercase tracking-wide">
          Master Key
        </span>
        <span className="text-xs text-[#8b8b9e]">
          Use this as your <code className="text-[#00C4B4]">x-master-key</code> header
        </span>
      </div>
      <div className="flex items-center gap-3 bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-3">
        <code className="flex-1 text-sm font-mono text-[#c8c8d8] break-all">
          {displayed}
        </code>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide master key" : "Show master key"}
            className="text-xs text-[#8b8b9e] hover:text-white transition-colors px-3 min-h-[44px] rounded border border-[#2a2a38] hover:border-[#363650]"
          >
            {visible ? "Hide" : "Show"}
          </button>
          <button
            onClick={copy}
            aria-label="Copy master key"
            className="text-xs text-[#00C4B4] hover:text-white transition-colors px-3 min-h-[44px] rounded border border-[#00C4B4]/20 hover:border-[#00C4B4]/40"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={rotating}
            aria-label="Rotate master key"
            className="text-xs text-amber-400 hover:text-white transition-colors px-3 min-h-[44px] rounded border border-amber-400/20 hover:border-amber-400/40 disabled:opacity-50"
          >
            {rotating ? "Rotating…" : "Rotate"}
          </button>
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}

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
