export default function NotFound() {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-20">
      <div className="text-4xl">🔍</div>
      <h1 className="text-xl font-bold text-white">Not found</h1>
      <p className="text-[#8b8b9e] text-sm max-w-md">
        That config doesn&apos;t exist — it may have been deleted, or the link is wrong.
      </p>
      <a
        href="/"
        className="bg-[#00C4B4] hover:bg-[#00a89a] text-black font-semibold text-sm px-6 py-3 rounded-lg transition-colors min-h-[44px] inline-flex items-center"
      >
        ← Back to dashboard
      </a>
    </div>
  );
}
