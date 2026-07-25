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

      <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-6 flex flex-col gap-4">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonTableRows rows={6} />
      </div>
    </div>
  );
}
