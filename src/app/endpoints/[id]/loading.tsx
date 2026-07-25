import { SkeletonBlock, LoadingAnnounce } from "@/components/ui/Skeleton";

/**
 * Mirrors the endpoint shell: back link, title, URL bar, tab row, panel.
 *
 * Without this the root dashboard skeleton — a three-card provider grid —
 * rendered here, so the page visibly changed shape on hydrate.
 */
export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <LoadingAnnounce label="Loading endpoint" />

      <div className="flex items-start gap-4">
        <SkeletonBlock className="h-11 w-16 rounded-lg shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <SkeletonBlock className="h-7 w-72 max-w-full" />
          <SkeletonBlock className="h-4 w-56 max-w-full" />
        </div>
      </div>

      {/* URL bar */}
      <SkeletonBlock className="h-[44px] rounded-lg" />

      {/* Tab row */}
      <div className="flex gap-1 border-b border-[#1a1a28] pb-0">
        <SkeletonBlock className="h-[44px] w-20 rounded-t-lg" />
        <SkeletonBlock className="h-[44px] w-20 rounded-t-lg" />
        <SkeletonBlock className="h-[44px] w-24 rounded-t-lg" />
      </div>

      <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-6 flex flex-col gap-4">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="h-14 rounded-lg" />
        <SkeletonBlock className="h-14 rounded-lg" />
      </div>
    </div>
  );
}
