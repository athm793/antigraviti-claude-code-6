"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner, Upload } from "./ui/Icon";
import { btnPrimary, btnSecondary, labelCls, textareaCls } from "@/lib/ui";

/**
 * Minimal CSV parser — quoted fields, embedded commas, doubled quotes. No
 * dependency: the inputs here are exports from provider dashboards, not
 * arbitrary spreadsheets.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim().length > 0)) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim().length > 0)) rows.push(row);
  return rows;
}

/**
 * Which column holds the keys?
 *
 * 1. A header cell matching key/secret/token names the column outright.
 * 2. Otherwise the column with the longest average value — API keys are
 *    long random strings, and every other export column (name, date, plan)
 *    is short.
 */
function extractKeysFromCsv(text: string): string[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const width = Math.max(...rows.map((r) => r.length));
  if (width <= 1) {
    // Plain list — treat like the textarea.
    return rows.map((r) => (r[0] ?? "").trim()).filter(Boolean);
  }

  const headerPattern = /^(api[_ -]?key|key|secret|token|api[_ -]?token|value)$/i;
  const header = rows[0].map((c) => c.trim());
  const headerMatch = header.findIndex((c) => headerPattern.test(c));

  let column: number;
  let dataRows: string[][];
  if (headerMatch !== -1) {
    column = headerMatch;
    dataRows = rows.slice(1);
  } else {
    const body = rows.slice(0, 200);
    let best = 0;
    let bestAvg = -1;
    for (let c = 0; c < width; c++) {
      const lengths = body.map((r) => (r[c] ?? "").trim().length).filter((l) => l > 0);
      if (lengths.length === 0) continue;
      const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      if (avg > bestAvg) {
        bestAvg = avg;
        best = c;
      }
    }
    column = best;
    // No named header — but if the first row's cell looks like a label rather
    // than a key (short, no digits), drop it.
    const first = (rows[0][column] ?? "").trim();
    const looksLikeLabel = first.length < 12 && !/\d/.test(first);
    dataRows = looksLikeLabel ? rows.slice(1) : rows;
  }

  return dataRows.map((r) => (r[column] ?? "").trim()).filter(Boolean);
}

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
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const keys = extractKeysFromCsv(text);
      if (keys.length === 0) {
        setImportNote("");
        setError(`No keys found in ${file.name}`);
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
