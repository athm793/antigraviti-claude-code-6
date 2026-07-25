import { SkeletonBlock, LoadingAnnounce } from "@/components/ui/Skeleton";

/**
 * Mirrors the user management page: back link, title block, the "Add User"
 * button, then the stack of user cards. Without this the root providers
 * skeleton showed through, which drew a provider grid and announced "Loading
 * providers" on a page that is neither.
 */
export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      <LoadingAnnounce label="Loading users" />

      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-4 w-16" />
        <SkeletonBlock className="h-8 w-52 max-w-full" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-3/4 max-w-full" />
      </div>

      <div className="flex flex-col gap-6">
        <SkeletonBlock className="h-11 w-32 rounded-lg" />

        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-[#111118] border border-[#2a2a38] rounded-xl p-4 flex items-start justify-between gap-4 flex-wrap"
            >
              <div className="flex flex-col gap-2">
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="h-3 w-56 max-w-full" />
              </div>
              <div className="flex items-center gap-2">
                <SkeletonBlock className="h-11 w-32 rounded-lg" />
                <SkeletonBlock className="h-11 w-28 rounded-lg" />
                <SkeletonBlock className="h-11 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
