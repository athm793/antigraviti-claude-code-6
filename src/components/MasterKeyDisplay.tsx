"use client";

import { useState } from "react";

export function MasterKeyDisplay({ masterKey }: { masterKey: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayed = visible
    ? masterKey
    : masterKey.slice(0, 8) + "••••••••••••••••" + masterKey.slice(-4);

  async function copy() {
    await navigator.clipboard.writeText(masterKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            className="text-xs text-[#8b8b9e] hover:text-white transition-colors px-2 py-1 rounded border border-[#2a2a38] hover:border-[#363650]"
          >
            {visible ? "Hide" : "Show"}
          </button>
          <button
            onClick={copy}
            className="text-xs text-[#00C4B4] hover:text-white transition-colors px-2 py-1 rounded border border-[#00C4B4]/20 hover:border-[#00C4B4]/40"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
