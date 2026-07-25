import { notFound } from "next/navigation";
import { authorizeEndpoint } from "@/lib/auth";
import { listRuns, isRunSort } from "@/lib/runLog";
import { getEndpointAnalytics } from "@/lib/runAnalytics";
import { RunsTable } from "@/components/RunsTable";
import { ProviderPerformance } from "@/components/ProviderPerformance";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { DEFAULT_PAGE_SIZE } from "@/components/ui/Pagination";
import { Clock } from "@/components/ui/Icon";
import { hintCls } from "@/lib/ui";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["all", "success", "partial", "miss", "error"]);

export default async function RunsTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const { id } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) notFound();

  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  // Checked against fixed sets rather than passed through: these reach WHERE
  // and ORDER BY clauses, and an unrecognised value should mean the default,
  // not an error.
  const status = VALID_STATUSES.has(query.status ?? "") ? query.status! : "all";
  // isRunSort, not `in` — the `in` operator answers true for inherited keys
  // like "constructor", which then resolved to a non-string sort expression.
  const sort = isRunSort(query.sort) ? query.sort : "when";
  const dir = query.dir === "asc" ? ("asc" as const) : ("desc" as const);

  const [{ rows, total }, analytics] = await Promise.all([
    listRuns(id, {
      limit: DEFAULT_PAGE_SIZE,
      offset: (page - 1) * DEFAULT_PAGE_SIZE,
      status,
      sort,
      dir,
    }),
    getEndpointAnalytics(id, 30),
  ]);

  if (analytics.runs === 0 && total === 0 && status === "all") {
    return (
      <EmptyState
        icon={<Clock className="w-10 h-10" />}
        title="No runs yet"
        body="Every call to this endpoint will be recorded here, with which provider answered and how long it took."
      >
        <p className={`${hintCls} max-w-md mx-auto`}>
          Logs start once the endpoint has steps and receives its first request. Test runs from the
          Build tab are deliberately not logged, so experiments can&apos;t skew these numbers.
        </p>
      </EmptyState>
    );
  }

  const answered = analytics.by_status.success + analytics.by_status.partial;
  const answerRate = analytics.runs > 0 ? Math.round((answered / analytics.runs) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Runs" value={analytics.runs} sub={`last ${analytics.days} days`} />
        <StatTile
          label="Answered"
          value={`${answerRate}%`}
          sub={`${analytics.by_status.miss} found nothing`}
          tone="brand"
        />
        <StatTile
          label="Spent"
          value={`$${(analytics.total_cost_cents / 100).toFixed(2)}`}
          sub={`${analytics.upstream_calls} upstream calls`}
        />
        <StatTile
          label="Served from cache"
          value={analytics.cache_hits}
          sub={analytics.cache_hits > 0 ? "no credits spent" : "cache off or cold"}
          tone={analytics.cache_hits > 0 ? "brand" : "muted"}
        />
      </div>

      {analytics.by_status.error > 0 && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {analytics.by_status.error} run{analytics.by_status.error === 1 ? "" : "s"} failed
          outright in the last {analytics.days} days — those are breakages, not misses.
        </p>
      )}

      {analytics.steps.length > 0 && <ProviderPerformance analytics={analytics} />}

      <RunsTable
        endpointId={id}
        runs={rows}
        total={total}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        status={status}
        sort={sort}
        dir={dir}
      />
    </div>
  );
}
