import type { ReactNode } from "react";

/**
 * Generalises the private Stat in StatsBar.
 *
 * Label + value are pinned to opposite ends rather than stacked and centred:
 * a wide box with a short number floating in the middle of it is the classic
 * dead-space tell. min-h keeps a row of tiles even when one has no sub-line.
 */
export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  children,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "brand" | "danger" | "warning" | "muted";
  children?: ReactNode;
}) {
  const valueTone = {
    default: "text-white",
    brand: "text-[#00C4B4]",
    danger: "text-red-400",
    warning: "text-amber-400",
    muted: "text-[#8b8b9e]",
  }[tone];

  return (
    <div className="bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-3 flex flex-col gap-1 min-h-[76px] justify-center">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[#8b8b9e] text-xs">{label}</span>
        <span className={`font-bold text-xl tabular-nums ${valueTone}`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
      </div>
      {/* Reserved line: present whether or not there's a sub-value, so tiles
          in a row stay the same height as their contents change. */}
      <div className="flex items-center justify-between gap-3 min-h-[16px]">
        <span className="text-[#4a4a58] text-xs truncate">{sub ?? ""}</span>
        {children}
      </div>
    </div>
  );
}
