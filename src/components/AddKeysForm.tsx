"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner, Upload } from "./ui/Icon";
import { btnPrimary, btnSecondary, labelCls, textareaCls } from "@/lib/ui";
import { extractKeysFromCsv } from "@/lib/csvKeys";


/**
 * Ceiling on an imported file. The whole file is read into React state and a
 * textarea, and even a 20,000-key export sits far under this, so anything
 * bigger is the wrong file rather than a big key pool.
 */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export function AddKeysForm({ configId }: { configId: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importNote, setImportNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
  } | null>(null);

  const keyCount = value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;

  function importFile(file: File) {
    function fail(message: string) {
      setImportNote("");
      setError(message);
    }

    if (file.size > MAX_IMPORT_BYTES) {
      fail(`${file.name} is too large (max ${MAX_IMPORT_BYTES / (1024 * 1024)} MB)`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const keys = extractKeysFromCsv(text);
      if (keys.length === 0) {
        fail(`No keys found in ${file.name}`);
        return;
      }
      // Loaded into the textarea, not submitted — the count is visible and
      // adding is still an explicit click, same as pasting.
      setError("");
      setResult(null);
      setValue((prev) => {
        const existing = prev.trim();
        return existing ? `${existing}\n${keys.join("\n")}` : keys.join("\n");
      });
      setImportNote(`${keys.length} key${keys.length === 1 ? "" : "s"} from ${file.name}`);
    };
    // Without these an unreadable file (permissions, removed device) is
    // completely silent — nothing loads and nothing is said.
    reader.onerror = () => fail(`Could not read ${file.name} — try picking it again`);
    reader.onabort = () => fail(`Reading ${file.name} was interrupted`);
    reader.readAsText(file);
  }

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
      setImportNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add keys");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <label htmlFor="add-keys-textarea" className={labelCls}>
          API keys (one per line)
        </label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`${btnSecondary} gap-1.5`}
          data-tip="Load keys from a CSV or text file — the key column is detected automatically"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="sr-only"
          aria-label="Import keys from a CSV or text file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile(file);
            // Reset so re-picking the same file fires change again.
            e.target.value = "";
          }}
        />
      </div>
      <textarea
        id="add-keys-textarea"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setImportNote("");
        }}
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
            {importNote ? `${importNote} · ` : ""}
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
