import {
  SkeletonBlock,
  SkeletonTableRows,
  LoadingAnnounce,
} from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnounce label="Loading runs" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-[76px] rounded-lg" />
        ))}
      </div>

      {/* Provider performance, then the run table — the real page's two cards,
          so nothing changes shape when the data lands. */}
      <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-6 flex flex-col gap-4">
        <SkeletonBlock className="h-4 w-64" />
        <SkeletonTableRows rows={3} />
        <SkeletonBlock className="h-[72px] rounded-lg" />
      </div>

      <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-11 w-44 rounded-lg" />
        </div>
        {/* The list is fixed at 15 a page, so the skeleton is too. */}
        <SkeletonTableRows rows={15} />
        <div className="flex items-center justify-between gap-4 pt-2">
          <SkeletonBlock className="h-3 w-48" />
          <SkeletonBlock className="h-11 w-64 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
