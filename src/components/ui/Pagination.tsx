import { ArrowLeft, ArrowRight } from "./Icon";
import { formatNumber } from "@/lib/format";

export const DEFAULT_PAGE_SIZE = 15;

/**
 * Always renders, even at a single page — disabled-styled rather than absent.
 * A footer that appears once results spill past page one makes the whole table
 * jump the first time it happens.
 *
 * Server component: prev/next are plain links, matching the app's no-next/link
 * convention.
 */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  label = "results",
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const hasPrev = current > 1;
  const hasNext = current < pages;

  const stepCls =
    "min-h-[44px] min-w-[44px] px-3 inline-flex items-center gap-1.5 text-sm rounded-lg border transition-colors";
  const enabled =
    "bg-[#0a0a10] text-[#c8c8d8] border-[#2a2a38] hover:bg-[#15151f] hover:border-[#363650]";
  const disabled =
    "bg-[#0a0a10] text-[#4a4a58] border-[#2a2a38] pointer-events-none";

  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      <p className="text-xs text-[#8b8b9e] tabular-nums">
        Showing {formatNumber(from)}–{formatNumber(to)} of{" "}
        {formatNumber(total)} {label}
      </p>

      <div className="flex items-center gap-2">
        <a
          href={hasPrev ? hrefFor(current - 1) : undefined}
          aria-disabled={!hasPrev}
          className={`${stepCls} ${hasPrev ? enabled : disabled}`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Previous
        </a>
        <span className="text-xs text-[#8b8b9e] tabular-nums min-w-[5rem] text-center">
          Page {current} of {pages}
        </span>
        <a
          href={hasNext ? hrefFor(current + 1) : undefined}
          aria-disabled={!hasNext}
          className={`${stepCls} ${hasNext ? enabled : disabled}`}
        >
          Next
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
