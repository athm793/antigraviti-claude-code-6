/**
 * Link-based tabs — real navigations, not client state.
 *
 * Each tab is its own route, so each gets its own loading.tsx and only the
 * panel below swaps while the header and tab bar stay put. That is the whole
 * reason to prefer routes over a ?tab= query param here.
 *
 * Server component: no hooks, the caller passes the current href.
 */
export function Tabs({
  items,
  currentHref,
}: {
  items: { href: string; label: string; count?: number }[];
  currentHref: string;
}) {
  return (
    <nav className="flex items-end gap-1 border-b border-[#1a1a28] overflow-x-auto">
      {items.map((item) => {
        const active = item.href === currentHref;
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
                {item.count.toLocaleString()}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
