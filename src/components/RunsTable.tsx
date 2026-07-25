import type { RunLogRow } from "@/lib/runLog";
import { RUN_STATUS_LABELS, RUN_STATUS_TONES, toneClass } from "@/lib/runStatus";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Pagination } from "./ui/Pagination";
import { SortableTh, type SortDir } from "./ui/SortableTh";
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
  sort,
  dir,
}: {
  endpointId: string;
  runs: RunLogRow[];
  total: number;
  page: number;
  pageSize: number;
  status: string;
  sort: string;
  dir: SortDir;
}) {
  /**
   * Sorting, filtering and paging all live in the URL, composed here so a
   * sort click keeps the filter and a page click keeps the sort. Changing the
   * sort resets to page 1 — page 3 of a different ordering is meaningless.
   */
  function href(over: { page?: number; sort?: string; dir?: SortDir }) {
    const params = new URLSearchParams();
    const nextPage = over.page ?? 1;
    if (nextPage > 1) params.set("page", String(nextPage));
    if (status !== "all") params.set("status", status);
    const nextSort = over.sort ?? sort;
    const nextDir = over.dir ?? dir;
    if (nextSort !== "when" || nextDir !== "desc") {
      params.set("sort", nextSort);
      params.set("dir", nextDir);
    }
    const qs = params.toString();
    return `/endpoints/${endpointId}/runs${qs ? `?${qs}` : ""}`;
  }

  const sortable = (label: string, key: string, className: string, align?: "right") => (
    <SortableTh
      label={label}
      sortKey={key}
      currentSort={sort}
      currentDir={dir}
      hrefFor={(k, d) => href({ sort: k, dir: d })}
      align={align}
      className={className}
    />
  );

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
              {sortable("When", "when", "w-44")}
              {/* Input is free-form JSON — there is no ordering of it anyone
                  means, so it stays a plain header. */}
              <th scope="col" className={tableThCls}>Input</th>
              {sortable("Answered by", "resolved_by", "w-40")}
              {sortable("Calls", "calls", "w-24", "right")}
              {sortable("Time", "time", "w-24", "right")}
              {sortable("Result", "status", "w-36")}
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
        hrefFor={(next) => href({ page: next })}
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
