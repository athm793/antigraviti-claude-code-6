import { SkeletonCard, LoadingAnnounce } from "@/components/ui/Skeleton";

/**
 * Only the panel — the title, URL bar and tabs live in the layout, so
 * switching tabs replaces this and nothing above it moves.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnounce label="Loading settings" />
      <SkeletonCard lines={6} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={2} />
    </div>
  );
}
