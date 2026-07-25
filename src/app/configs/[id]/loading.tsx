import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonTableRows,
  LoadingAnnounce,
} from "@/components/ui/Skeleton";

/** Mirrors the provider detail page section-for-section. */
export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8">
      <LoadingAnnounce label="Loading provider" />

      <div className="flex items-start gap-4">
        <SkeletonBlock className="h-11 w-16 rounded-lg shrink-0" />
        {/* min-w-0: a flex child defaults to min-width:auto, so without this
            the fixed-width bars below push the row past the viewport on mobile
            and max-w-full never gets a chance to apply. */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <SkeletonBlock className="h-7 w-64 max-w-full" />
          <SkeletonBlock className="h-4 w-80 max-w-full" />
        </div>
      </div>

      <SkeletonCard lines={2} />

      <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-5 flex flex-col gap-3">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-[66px] rounded-lg" />
      </div>

      <SkeletonCard lines={3} />
      <SkeletonCard lines={2} />

      <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-6 flex flex-col gap-4">
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonTableRows rows={5} />
      </div>
    </div>
  );
}
