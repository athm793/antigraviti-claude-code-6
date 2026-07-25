import {
  SkeletonBlock,
  SkeletonTableRows,
  LoadingAnnounce,
} from "@/components/ui/Skeleton";

/** Mirrors the endpoints list: title block, then the table. */
export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8">
      <LoadingAnnounce label="Loading endpoints" />

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2 min-w-0">
          <SkeletonBlock className="h-7 w-40 max-w-full" />
          <SkeletonBlock className="h-4 w-96 max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-36 rounded-lg shrink-0" />
      </div>

      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonTableRows rows={6} />
        <div className="flex items-center justify-between gap-4 pt-2">
          <SkeletonBlock className="h-3 w-48" />
          <SkeletonBlock className="h-11 w-64 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
