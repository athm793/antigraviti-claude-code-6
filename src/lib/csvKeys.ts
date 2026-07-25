/**
 * CSV key extraction, kept out of the component so it can be tested.
 *
 * This is deliberately pure: no React, no DOM, no imports. It is exercised by
 * tests/engine.test.mjs, which is how the header-row defect below is now
 * pinned down — that bug wrote a column label into a live key pool, where it
 * sorted first and failed every request through the provider until someone
 * deleted it by hand.
 */

/**
 * Minimal CSV parser — quoted fields, embedded commas, doubled quotes. No
 * dependency: the inputs here are exports from provider dashboards, not
 * arbitrary spreadsheets.
 */
export function parseCsv(text: string): string[][] {
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

const headerPattern = /^(api[_ -]?key|key|secret|token|api[_ -]?token|value)$/i;

/** Short and digit-free is a column label, never an API key. */
export function looksLikeLabel(cell: string): boolean {
  return cell.length < 12 && !/\d/.test(cell);
}

/**
 * Which column holds the keys?
 *
 * 1. A header cell matching key/secret/token names the column outright.
 * 2. Otherwise the column with the longest average value — API keys are
 *    long random strings, and every other export column (name, date, plan)
 *    is short.
 */
export function extractKeysFromCsv(text: string): string[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const width = Math.max(...rows.map((r) => r.length));
  if (width <= 1) {
    // Plain list — treat like the textarea, except a one-column export still
    // ships its header row. Importing "api_key" as a key is not cosmetic: it
    // lands first in the rotation and every request through the provider
    // fails until someone deletes it by hand.
    const first = (rows[0][0] ?? "").trim();
    const dataRows =
      headerPattern.test(first) || looksLikeLabel(first) ? rows.slice(1) : rows;
    // A header-only file yields nothing, so the caller reports "No keys found"
    // rather than importing the label.
    return dataRows.map((r) => (r[0] ?? "").trim()).filter(Boolean);
  }

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
    dataRows = looksLikeLabel(first) ? rows.slice(1) : rows;
  }

  return dataRows.map((r) => (r[column] ?? "").trim()).filter(Boolean);
}
