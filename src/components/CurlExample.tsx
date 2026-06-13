"use client";

import { useState, useEffect } from "react";

export function CurlExample({
  configId,
  masterKey,
}: {
  configId: string;
  masterKey: string;
}) {
  const [copied, setCopied] = useState(false);
  const [baseUrl, setBaseUrl] = useState("https://your-app.vercel.app");

  // Set on mount only — avoids a server/client hydration mismatch from
  // reading window.location during render.
  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  const example = `curl ${baseUrl}/api/proxy/${configId}/your/api/path \\
  -H "x-master-key: ${masterKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"key": "value"}'`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(example);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable (e.g. insecure context) — silently ignore
    }
  }

  return (
    <div className="bg-[#0a0a10] border border-[#2a2a38] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a2a38]">
        <span className="text-[#8b8b9e] text-xs font-medium">cURL Example</span>
        <button
          onClick={copy}
          aria-label="Copy curl command"
          className="text-xs text-[#00C4B4] hover:text-white transition-colors min-h-[44px] px-2 -my-2.5 flex items-center"
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
