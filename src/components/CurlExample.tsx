"use client";

import { useState } from "react";

export function CurlExample({
  configId,
  masterKey,
}: {
  configId: string;
  masterKey: string;
}) {
  const [copied, setCopied] = useState(false);

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://your-app.vercel.app";

  const example = `curl ${baseUrl}/api/proxy/${configId}/your/api/path \\
  -H "x-master-key: ${masterKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"key": "value"}'`;

  async function copy() {
    await navigator.clipboard.writeText(example);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-[#0a0a10] border border-[#2a2a38] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a2a38]">
        <span className="text-[#8b8b9e] text-xs font-medium">cURL Example</span>
        <button
          onClick={copy}
          className="text-xs text-[#00C4B4] hover:text-white transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-[#c8c8d8] overflow-x-auto whitespace-pre leading-relaxed">
        {example}
      </pre>
      <div className="px-4 pb-3 text-xs text-[#8b8b9e]">
        Replace <code className="text-[#00C4B4]">/your/api/path</code> with the
        actual endpoint path for your target API. The proxy handles key rotation
        automatically.
      </div>
    </div>
  );
}
