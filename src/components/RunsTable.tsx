import type { RunLogRow } from "@/lib/runLog";
import { RUN_STATUS_LABELS, RUN_STATUS_TONES, toneClass } from "@/lib/runStatus";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Pagination } from "./ui/Pagination";
import {
  badgeBase,
  cardCls,
  numericCls,
  tableHeadRowCls,
  tableRowCls,
  tableTdCls,
  tableThCls,
} from "@/lib/ui";
import { RunStatusFilter } from "./RunStatusFilter";

/**
 * Recent runs.
 *
 * A whole row is the link into the detail — no standalone "View" button. Every
 * variable column is width-hinted and tabular so a slow run appearing doesn't
 * shove the columns around.
 */
export function RunsTable({
  endpointId,
  runs,
  total,
  page,
  pageSize,
  status,
}: {
  endpointId: string;
  runs: RunLogRow[];
  total: number;
  page: number;
  pageSize: number;
  status: string;
}) {
  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">Recent runs</h2>
        <RunStatusFilter endpointId={endpointId} status={status} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={tableHeadRowCls}>
              <th scope="col" className={`${tableThCls} w-44`}>When</th>
              <th scope="col" className={tableThCls}>Input</th>
              <th scope="col" className={`${tableThCls} w-40`}>Answered by</th>
              <th scope="col" className={`${tableThCls} w-24 text-right`}>Calls</th>
              <th scope="col" className={`${tableThCls} w-24 text-right`}>Time</th>
              <th scope="col" className={`${tableThCls} w-36`}>Result</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              // A fixed-height row rather than an empty tbody: filtering down
              // to nothing would otherwise collapse the card and jump the page.
              <tr>
                <td colSpan={6} className="h-40 text-center text-sm text-[#8b8b9e]">
                  No runs match this filter.
                </td>
              </tr>
            )}
            {runs.map((run) => (
              <tr key={run.id} className={`${tableRowCls} relative`}>
                <td className={`${tableTdCls} text-[#8b8b9e] tabular-nums whitespace-nowrap`}>
                  <a
                    href={`/endpoints/${endpointId}/runs/${run.id}`}
                    className="after:absolute after:inset-0 text-[#c8c8d8] hover:text-white transition-colors"
                  >
                    {formatDateTime(run.created_at)}
                  </a>
                </td>
                <td className={`${tableTdCls} text-[#8b8b9e] max-w-0`}>
                  <span className="block truncate font-mono text-xs">
                    {run.input ? summarise(run.input) : "—"}
                  </span>
                </td>
                <td className={`${tableTdCls} text-[#c8c8d8] truncate`}>
                  {run.cache_hit ? (
                    <span className="text-[#8b8b9e]">Cached</span>
                  ) : (
                    (run.resolved_by_name ?? run.resolved_by ?? "—")
                  )}
                </td>
                <td className={`${tableTdCls} ${numericCls} text-[#8b8b9e]`}>
                  {formatNumber(run.upstream_calls)}
                </td>
                <td className={`${tableTdCls} ${numericCls} text-[#8b8b9e]`}>
                  {formatNumber(run.duration_ms)} ms
                </td>
                <td className={tableTdCls}>
                  <span
                    className={`${badgeBase} ${toneClass(RUN_STATUS_TONES[run.status])} w-[7.5rem] justify-center`}
                  >
                    {RUN_STATUS_LABELS[run.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        label="runs"
        hrefFor={(next) =>
          `/endpoints/${endpointId}/runs?page=${next}${status !== "all" ? `&status=${status}` : ""}`
        }
      />
    </div>
  );
}

/** "domain=acme.com · first_name=Ana" — enough to recognise the row. */
function summarise(input: Record<string, unknown>): string {
  return (
    Object.entries(input)
      .map(([key, value]) => `${key}=${typeof value === "object" ? "…" : String(value)}`)
      .join(" · ") || "—"
  );
}
