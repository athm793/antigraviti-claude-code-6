"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center text-center gap-4 py-20">
      <div className="text-4xl">⚠️</div>
      <h1 className="text-xl font-bold text-white">Something went wrong</h1>
      <p className="text-[#8b8b9e] text-sm max-w-md">
        KeyProxy hit an unexpected error. This is usually a temporary issue with the
        database connection — try again, and if it keeps happening check that{" "}
        <code className="text-[#00C4B4]">DATABASE_URL</code> is set correctly.
      </p>
      <button
        onClick={reset}
        className="bg-[#00C4B4] hover:bg-[#00a89a] text-black font-semibold text-sm px-6 py-3 rounded-lg transition-colors min-h-[44px]"
      >
        Try again
      </button>
      <a href="/" className="text-[#8b8b9e] hover:text-white text-sm transition-colors">
        ← Back to dashboard
      </a>
    </div>
  );
}
