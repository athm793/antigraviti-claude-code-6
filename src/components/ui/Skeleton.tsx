/**
 * Skeleton primitives.
 *
 * Every page in this app is force-dynamic and blocks on the database, so
 * before these existed a navigation showed nothing at all until the query
 * returned.
 *
 * Two rules a skeleton has to follow to be worth having: it mirrors the real
 * layout (same card chrome, same row heights) so hydration doesn't jump, and
 * it stops pulsing under prefers-reduced-motion.
 */

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-[#15151f] rounded motion-safe:animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

/** Card shell matching cardCls, with skeleton lines inside. */
export function SkeletonCard({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={`bg-[#111118] border border-[#2a2a38] rounded-xl p-6 flex flex-col gap-4 ${className}`}
    >
      <SkeletonBlock className="h-4 w-32" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} className="h-3 w-full" />
      ))}
    </div>
  );
}

export function SkeletonTableRows({
  rows,
  height = "h-[52px]",
}: {
  rows: number;
  height?: string;
}) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${height} border-b border-[#1a1a28] flex items-center`}>
          <SkeletonBlock className="h-3 w-full max-w-[70%]" />
        </div>
      ))}
    </div>
  );
}

/** Screen-reader announcement so a loading state isn't silent. */
export function LoadingAnnounce({ label }: { label: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {label}
    </p>
  );
}
