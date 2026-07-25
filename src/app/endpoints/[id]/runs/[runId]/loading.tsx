import { SkeletonBlock, LoadingAnnounce } from "@/components/ui/Skeleton";

/** Mirrors the run detail: header strip, input/result pair, step cards. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnounce label="Loading run" />

      <div className="flex flex-wrap items-center gap-3">
        <SkeletonBlock className="h-11 w-28 rounded-lg" />
        <SkeletonBlock className="h-6 w-[7.5rem] rounded" />
        <SkeletonBlock className="h-3 w-64 max-w-full" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonBlock className="h-[14rem] rounded-xl" />
        <SkeletonBlock className="h-[14rem] rounded-xl" />
      </div>

      <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-6 flex flex-col gap-4">
        <SkeletonBlock className="h-4 w-44" />
        <SkeletonBlock className="h-[88px] rounded-lg" />
        <SkeletonBlock className="h-[88px] rounded-lg" />
      </div>
    </div>
  );
}
