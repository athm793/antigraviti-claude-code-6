"use client";

import { usePathname } from "next/navigation";
import { focusRingCls } from "@/lib/ui";

/**
 * Top-level navigation.
 *
 * Client-only because it needs the current path to mark the active item — it
 * takes no data, so it stays a cheap leaf inside the server layout, the same
 * shape as UserMenu.
 */
const ITEMS = [
  { href: "/", label: "Providers", match: (p: string) => p === "/" || p.startsWith("/configs") },
  { href: "/endpoints", label: "Endpoints", match: (p: string) => p.startsWith("/endpoints") },
];

export function HeaderNav() {
  const pathname = usePathname() ?? "/";

  // Auth screens have no navigation to offer.
  if (pathname.startsWith("/login") || pathname.startsWith("/setup")) return null;

  return (
    <nav className="flex items-center gap-1" aria-label="Main">
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`min-h-[44px] inline-flex items-center px-3 rounded-lg text-sm transition-colors kp-press ${focusRingCls} ${
              active
                ? "text-white bg-[#15151f]"
                : "text-[#8b8b9e] hover:text-white hover:bg-[#0f0f18]"
            }`}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
