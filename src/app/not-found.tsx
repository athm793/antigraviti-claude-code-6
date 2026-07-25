import { Search, ArrowLeft } from "@/components/ui/Icon";
import { btnPrimary } from "@/lib/ui";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-20">
      <Search className="w-10 h-10 text-[#4a4a58]" />
      <h1 className="text-xl font-bold text-white">Not found</h1>
      <p className="text-[#8b8b9e] text-sm max-w-md">
        That page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <a href="/" className={`${btnPrimary} gap-1.5`}>
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </a>
    </div>
  );
}
