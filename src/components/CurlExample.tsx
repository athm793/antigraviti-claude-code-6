"use client";

import { useState, useEffect } from "react";
import { CopyButton } from "./ui/CopyButton";

export function CurlExample({
  configId,
  masterKey,
}: {
  configId: string;
  masterKey: string;
}) {
  const [baseUrl, setBaseUrl] = useState("https://your-app.vercel.app");

  // Set on mount only — avoids a server/client hydration mismatch from
  // reading window.location during render.
  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  function buildExample(key: string) {
    return `curl ${baseUrl}/api/proxy/${configId}/your/api/path \\
  -H "x-master-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"key": "value"}'`;
  }

  // Same mask shape as MasterKeyDisplay: printing the key in full here defeats
  // that Show/Hide toggle on screenshots and screen shares. The copy still
  // carries the real key, so the command pastes and runs.
  const masked = `${masterKey.slice(0, 8)}••••••••••••••••${masterKey.slice(-4)}`;

  return (
    <div className="bg-[#0a0a10] border border-[#2a2a38] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a2a38]">
        <span className="text-[#8b8b9e] text-xs font-medium">cURL Example</span>
        <CopyButton
          value={buildExample(masterKey)}
          ariaLabel="Copy curl command"
          className="-my-2.5"
        />
      </div>
      <pre className="p-4 text-xs font-mono text-[#c8c8d8] overflow-x-auto whitespace-pre leading-relaxed">
        {buildExample(masked)}
      </pre>
      <div className="px-4 pb-3 text-xs text-[#8b8b9e]">
        Replace <code className="text-[#00C4B4]">/your/api/path</code> with the
        actual endpoint path for your target API. Copy fills in your real master
        key. The proxy handles key rotation automatically.
      </div>
    </div>
  );
}
