"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "./ui/CopyButton";
import { formatDate } from "@/lib/format";

/**
 * The endpoint's public URL, with the origin filled in on the client.
 *
 * Reading window.location during render would cause a hydration mismatch, so
 * it starts as a placeholder and fills in on mount — the same approach
 * CurlExample already uses.
 */
export function EndpointUrlBar({
  slug,
  stepCount,
  updatedAt,
}: {
  slug: string;
  stepCount: number;
  updatedAt: string;
}) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = `${origin || "https://your-keyproxy.vercel.app"}/api/run/${slug}`;

  return (
    <div className="flex flex-wrap items-center gap-3 bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-2">
      <span className="text-[#00C4B4] text-xs font-mono font-semibold shrink-0">POST</span>
      {/* Not flex-1: stretching the URL left ~550px of void between it and the
          copy button at 1280px. It shrinks to its content and truncates only
          when there genuinely isn't room. */}
      <code className="min-w-full sm:min-w-0 max-w-full text-xs font-mono text-[#c8c8d8] truncate">
        {url}
      </code>
      <CopyButton value={url} ariaLabel="Copy endpoint URL" showLabel={false} />
      {/* Pinned right so the row spans the bar rather than leaving a tail of
          empty space after the copy control. */}
      <span className="text-[#8b8b9e] text-xs tabular-nums shrink-0 sm:ml-auto">
        {stepCount} step{stepCount === 1 ? "" : "s"} · updated {formatDate(updatedAt)}
      </span>
    </div>
  );
}
