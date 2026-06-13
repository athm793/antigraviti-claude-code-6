"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export function AddKeysForm({ configId }: { configId: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const keyCount = value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (keyCount === 0) return;
    setLoading(true);
    setResult(null);
    setError("");

    const keys = value
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    try {
      const res = await fetch(`/api/configs/${configId}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to add keys");
      }

      const data = await res.json();
      setResult(data);
      setValue("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add keys");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="add-keys-textarea" className="text-sm font-medium text-[#c8c8d8]">
        API keys (one per line)
      </label>
      <textarea
        id="add-keys-textarea"
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={"Paste your API keys here, one per line:\nsk-abc123...\nsk-def456...\nsk-ghi789..."}
        rows={6}
        className="w-full bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-3 text-sm font-mono text-[#c8c8d8] placeholder-[#4a4a58] focus:outline-none focus:border-[#00C4B4]/40 resize-y"
      />
      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="submit"
          disabled={loading || keyCount === 0}
          className="bg-[#00C4B4] hover:bg-[#00a89a] disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold text-sm px-5 py-2 rounded-lg transition-colors min-h-[44px]"
        >
          {loading ? "Adding…" : `Add ${keyCount > 0 ? keyCount : ""} Key${keyCount !== 1 ? "s" : ""}`}
        </button>
        {keyCount > 0 && !loading && (
          <span className="text-[#8b8b9e] text-sm">
            {keyCount} key{keyCount !== 1 ? "s" : ""} detected
          </span>
        )}
        {result && (
          <span className="text-sm">
            <span className="text-[#00C4B4]">{result.inserted} added</span>
            {result.skipped > 0 && (
              <span className="text-[#8b8b9e]"> · {result.skipped} skipped (duplicates)</span>
            )}
          </span>
        )}
        {error && <span className="text-red-400 text-sm">{error}</span>}
      </div>
    </form>
  );
}
