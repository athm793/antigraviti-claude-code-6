/**
 * Structured logging: one JSON object per line on stdout/stderr, so platform
 * log search (Vercel, Datadog, grep) can filter on fields instead of parsing
 * prose. Deliberately tiny — no transports, no levels config, no dependency.
 *
 * Rules for callers:
 *  - `event` is a stable snake_case name; dashboards key on it.
 *  - Fields are an allowlist you choose at the call site. Never pass a whole
 *    request, header bag, or upstream body — that's how secrets end up in
 *    logs. Ids, counts, outcomes, durations.
 */

type LogLevel = "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, string | number | boolean | null> = {}
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
