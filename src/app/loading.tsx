import {
  SkeletonBlock,
  LoadingAnnounce,
} from "@/components/ui/Skeleton";

/** Mirrors the providers dashboard: title block, then the 3-up card grid. */
export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8">
      <LoadingAnnounce label="Loading providers" />

      <div className="flex items-center justify-between gap-4">
        {/* min-w-0 so the fixed-width bars can shrink instead of overflowing
            the viewport on mobile (flex children are min-width:auto). */}
        <div className="flex flex-col gap-2 min-w-0">
          <SkeletonBlock className="h-7 w-40 max-w-full" />
          <SkeletonBlock className="h-4 w-96 max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-36 rounded-lg shrink-0" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-[#111118] border border-[#2a2a38] rounded-xl p-5 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-3 w-44" />
            </div>
            {/* Same three-stat strip the real card renders, so nothing moves
                when the data arrives. */}
            <div className="flex gap-3">
              <SkeletonBlock className="h-[58px] flex-1 rounded-lg" />
              <SkeletonBlock className="h-[58px] flex-1 rounded-lg" />
              <SkeletonBlock className="h-[58px] flex-1 rounded-lg" />
            </div>
            <SkeletonBlock className="h-11 rounded-lg" />
            <SkeletonBlock className="h-11 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
