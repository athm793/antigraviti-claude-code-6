"use client";

import { usePathname } from "next/navigation";
import { formatNumber } from "@/lib/format";

/**
 * Link-based tabs — real navigations, not client state.
 *
 * Each tab is its own route, so each gets its own loading.tsx and only the
 * panel below swaps while the header and tab bar stay put. That is the whole
 * reason to prefer routes over a ?tab= query param here.
 *
 * Client-only so it can read the current path itself: a layout has no way to
 * know which of its child routes rendered, so passing the active href down
 * from the server would always be a guess.
 */
export function Tabs({
  items,
}: {
  items: { href: string; label: string; count?: number }[];
}) {
  const pathname = usePathname() ?? "";

  // Longest matching href wins, so /endpoints/x/runs picks "Runs" rather than
  // also matching the "Build" tab at /endpoints/x.
  const activeHref = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    // overflow-y-hidden is load-bearing: setting overflow-x alone makes the
    // other axis compute to auto, and the -mb-px on each tab makes the content
    // 1px taller than the strip — which renders a stray vertical scrollbar.
    <nav className="flex items-end gap-1 border-b border-[#1a1a28] overflow-x-auto overflow-y-hidden">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`min-h-[44px] inline-flex items-center gap-2 px-3 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
              active
                ? "text-white border-[#00C4B4]"
                : "text-[#8b8b9e] border-transparent hover:text-white"
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              // Fixed width so a count changing 9 -> 1,204 can't resize the tab
              // and shove its neighbours sideways.
              <span className="tabular-nums text-xs text-[#8b8b9e] min-w-[2.5rem] text-left">
                {formatNumber(item.count)}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
