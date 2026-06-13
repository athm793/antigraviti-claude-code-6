"use client";

import { useState } from "react";

type Result = {
  ok: boolean;
  status?: number;
  latencyMs?: number;
  message: string;
};

export function TestConnectionButton({ configId }: { configId: string }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/configs/${configId}/test`, { method: "POST" });
      const data = (await res.json()) as Result;
      setResult(data);
    } catch {
      setResult({ ok: false, message: "Request failed — check your connection and try again." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={runTest}
        disabled={testing}
        className="self-start text-sm bg-[#0a0a10] hover:bg-[#15151f] text-[#c8c8d8] border border-[#2a2a38] hover:border-[#363650] px-4 min-h-[44px] rounded-lg transition-colors disabled:opacity-50"
      >
        {testing ? "Testing…" : "Test Connection"}
      </button>
      {result && (
        <p className={`text-sm ${result.ok ? "text-[#00C4B4]" : "text-red-400"}`}>
          {result.ok ? "✓ " : "✕ "}
          {result.message}
        </p>
      )}
    </div>
  );
}
