/**
 * Deterministic formatting for dates and numbers.
 *
 * `toLocaleDateString()` renders in the *server's* locale during SSR and the
 * *browser's* locale on hydration. When that text sits inside a client
 * component the two disagree, React throws a hydration mismatch, and it
 * regenerates the whole subtree — which silently breaks interactivity in
 * every component below it.
 *
 * These produce identical output on both sides.
 */

/**
 * Thousands separators, fixed to a comma.
 *
 * `Number.toLocaleString()` has the same split-brain problem as dates: a
 * server in one locale renders "1,204" while a browser in another renders
 * "1.204". Under 1000 they agree, which is exactly why this kind of bug ships
 * — it only appears once real traffic arrives.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const negative = value < 0;
  const digits = Math.abs(Math.trunc(value)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "25 Jul 2026" */
export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "25 Jul 2026, 10:28" — UTC, so it reads the same everywhere. */
export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(d)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "3 minutes ago" — for recency, where the exact timestamp isn't the point. */
export function formatRelative(value: string | Date, now: number): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";

  const seconds = Math.round((now - d.getTime()) / 1000);
  if (seconds < 60) return "just now";

  const units: [number, string][] = [
    [60, "minute"],
    [60, "hour"],
    [24, "day"],
  ];

  let value_ = seconds;
  let unit = "second";
  for (const [size, name] of units) {
    if (value_ < size) break;
    value_ = Math.floor(value_ / size);
    unit = name;
  }

  if (unit === "day" && value_ > 30) return formatDate(d);
  return `${value_} ${unit}${value_ === 1 ? "" : "s"} ago`;
}
