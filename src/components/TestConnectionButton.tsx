"use client";

import { useState } from "react";
import { Check, X, Spinner } from "./ui/Icon";
import { btnSecondary } from "@/lib/ui";

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
        className={`${btnSecondary} self-start gap-2 min-w-[10.5rem]`}
      >
        {testing && <Spinner className="w-4 h-4" />}
        {testing ? "Testing…" : "Test connection"}
      </button>
      {/* Reserved height so the result appearing doesn't push the sections
          below it down the page. */}
      <div className="min-h-[20px]">
        {result && (
          <p
            className={`text-sm flex items-start gap-1.5 ${
              result.ok ? "text-[#00C4B4]" : "text-red-400"
            }`}
          >
            {result.ok ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <X className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            {result.message}
          </p>
        )}
      </div>
    </div>
  );
}
