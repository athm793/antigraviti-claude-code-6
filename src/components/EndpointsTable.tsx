import type { EndpointWithStats } from "@/lib/endpointTypes";
import { formatDateTime, formatNumber } from "@/lib/format";
import { SortableTh, type SortDir } from "./ui/SortableTh";
import { Pagination, DEFAULT_PAGE_SIZE } from "./ui/Pagination";
import {
  badgeBase,
  badgeTones,
  tableHeadRowCls,
  tableRowCls,
  tableTdCls,
} from "@/lib/ui";

/**
 * Server component. Sorting and paging live in the URL, so a view is
 * shareable and survives a reload — and sorting covers the whole set rather
 * than just the visible page.
 */
export function EndpointsTable({
  endpoints,
  sort,
  dir,
  page,
}: {
  endpoints: EndpointWithStats[];
  sort: string;
  dir: SortDir;
  page: number;
}) {
  const sorted = sortEndpoints(endpoints, sort, dir);
  const total = sorted.length;
  const pageSize = DEFAULT_PAGE_SIZE;
  const currentPage = Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / pageSize)));
  const rows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const hrefFor = (nextSort: string, nextDir: SortDir) =>
    `/endpoints?sort=${nextSort}&dir=${nextDir}&page=1`;
  const pageHref = (p: number) => `/endpoints?sort=${sort}&dir=${dir}&page=${p}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={tableHeadRowCls}>
              <SortableTh
                label="Endpoint"
                sortKey="name"
                currentSort={sort}
                currentDir={dir}
                hrefFor={hrefFor}
              />
              <SortableTh
                label="Steps"
                sortKey="steps"
                currentSort={sort}
                currentDir={dir}
                hrefFor={hrefFor}
                align="right"
                className="w-20"
              />
              <SortableTh
                label="Hit rate"
                sortKey="hit_rate"
                currentSort={sort}
                currentDir={dir}
                hrefFor={hrefFor}
                align="right"
                className="w-36"
              />
              <SortableTh
                label="Runs (7d)"
                sortKey="runs"
                currentSort={sort}
                currentDir={dir}
                hrefFor={hrefFor}
                align="right"
                className="w-28"
              />
              <SortableTh
                label="Status"
                sortKey="status"
                currentSort={sort}
                currentDir={dir}
                hrefFor={hrefFor}
                className="w-24"
              />
              <SortableTh
                label="Updated"
                sortKey="updated"
                currentSort={sort}
                currentDir={dir}
                hrefFor={hrefFor}
                className="w-40"
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((endpoint) => (
              <tr key={endpoint.id} className={`${tableRowCls} relative`}>
                <td className={tableTdCls}>
                  {/* Stretched link: the whole row is clickable, while any
                      future inline controls can sit above it with z-10. */}
                  <a
                    href={`/endpoints/${endpoint.id}`}
                    className="text-white font-medium hover:text-[#00C4B4] transition-colors after:absolute after:inset-0"
                  >
                    {endpoint.name}
                  </a>
                  <div className="text-[#8b8b9e] text-xs font-mono truncate">
                    /api/run/{endpoint.slug}
                  </div>
                </td>
                <td className={`${tableTdCls} text-right text-[#8b8b9e] tabular-nums`}>
                  {endpoint.step_count}
                </td>
                <td className={tableTdCls}>
                  <HitRate rate={endpoint.hit_rate_7d} />
                </td>
                <td className={`${tableTdCls} text-right text-[#8b8b9e] tabular-nums`}>
                  {formatNumber(endpoint.runs_7d)}
                </td>
                <td className={tableTdCls}>
                  <StatusBadge endpoint={endpoint} />
                </td>
                <td className={`${tableTdCls} text-[#8b8b9e] text-xs tabular-nums`}>
                  {formatDateTime(endpoint.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={currentPage}
        pageSize={pageSize}
        total={total}
        hrefFor={pageHref}
        label="endpoints"
      />
    </div>
  );
}

/**
 * A bar plus a number. Fixed width so a rate changing from 8% to 100% can't
 * shove the columns beside it.
 */
function HitRate({ rate }: { rate: number | null }) {
  if (rate === null) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-[#4a4a58] text-xs tabular-nums w-[3.5rem] text-right">
          No runs
        </span>
      </div>
    );
  }
  const pct = Math.round(rate * 100);
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="h-1 w-16 rounded-full bg-[#0a0a10] overflow-hidden shrink-0">
        <span
          className="block h-full bg-[#00C4B4] rounded-full"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="text-[#c8c8d8] text-xs tabular-nums w-[2.5rem] text-right">
        {pct}%
      </span>
    </div>
  );
}

/**
 * The one place a status is decided, so the badge and the status sort can't
 * drift apart. `rank` is the lifecycle order — how close the endpoint is to
 * actually serving traffic — because sorting these labels alphabetically would
 * put "Draft" above "Live" and mean nothing.
 */
function endpointStatus(endpoint: EndpointWithStats) {
  // Order matters: a paused endpoint with no steps is best described as
  // "Draft", because that's the thing to fix first.
  if (endpoint.step_count === 0) return { tone: badgeTones.neutral, label: "Draft", rank: 3 };
  if (!endpoint.enabled) return { tone: badgeTones.warning, label: "Paused", rank: 2 };
  if (!endpoint.has_key) return { tone: badgeTones.danger, label: "No key", rank: 1 };
  return { tone: badgeTones.brand, label: "Live", rank: 0 };
}

function StatusBadge({ endpoint }: { endpoint: EndpointWithStats }) {
  const { tone, label } = endpointStatus(endpoint);

  return <span className={`${badgeBase} ${tone} min-w-[4.5rem] justify-center`}>{label}</span>;
}

function sortEndpoints(
  endpoints: EndpointWithStats[],
  sort: string,
  dir: SortDir
): EndpointWithStats[] {
  const factor = dir === "asc" ? 1 : -1;
  const copy = [...endpoints];

  copy.sort((a, b) => {
    switch (sort) {
      case "name":
        // Case-insensitive so "apollo" and "Apollo" sort together.
        return factor * a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      case "hit_rate": {
        // Endpoints with no data sort last in either direction — they aren't
        // "0%", they're unknown, and ranking them as worst would be a lie.
        if (a.hit_rate_7d === null && b.hit_rate_7d === null) return 0;
        if (a.hit_rate_7d === null) return 1;
        if (b.hit_rate_7d === null) return -1;
        return factor * (a.hit_rate_7d - b.hit_rate_7d);
      }
      case "runs":
        return factor * (a.runs_7d - b.runs_7d);
      case "steps":
        return factor * (a.step_count - b.step_count);
      case "status":
        // Ascending puts the live ones first, which is the order someone
        // scanning for what's actually serving traffic expects.
        return factor * (endpointStatus(a).rank - endpointStatus(b).rank);
      case "updated":
      default:
        return factor * (Date.parse(a.updated_at) - Date.parse(b.updated_at));
    }
  });

  return copy;
}
