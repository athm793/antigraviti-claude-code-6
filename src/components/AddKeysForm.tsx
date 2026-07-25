"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "./ui/Icon";
import { btnPrimary, labelCls, textareaCls } from "@/lib/ui";

export function AddKeysForm({ configId }: { configId: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
  } | null>(null);

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
      <label htmlFor="add-keys-textarea" className={labelCls}>
        API keys (one per line)
      </label>
      <textarea
        id="add-keys-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={"Paste your API keys here, one per line:\nsk-abc123...\nsk-def456...\nsk-ghi789..."}
        rows={6}
        spellCheck={false}
        className={textareaCls}
      />
      <div className="flex items-center gap-4 flex-wrap min-h-[44px]">
        <button
          type="submit"
          disabled={loading || keyCount === 0}
          // Fixed width: the label goes "Add keys" -> "Add 12 keys" -> "Adding…"
          // as you type, and an unpinned button would resize on every keystroke.
          className={`${btnPrimary} gap-2 min-w-[10rem]`}
        >
          {loading && <Spinner className="w-4 h-4" />}
          {loading
            ? "Adding…"
            : keyCount > 0
              ? `Add ${keyCount} key${keyCount !== 1 ? "s" : ""}`
              : "Add keys"}
        </button>
        {keyCount > 0 && !loading && (
          <span className="text-[#8b8b9e] text-sm tabular-nums">
            {keyCount} key{keyCount !== 1 ? "s" : ""} detected
          </span>
        )}
        {result && (
          <span className="text-sm tabular-nums">
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
