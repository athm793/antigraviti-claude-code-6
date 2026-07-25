"use client";

import { useEffect } from "react";
import { AlertTriangle, ArrowLeft } from "@/components/ui/Icon";
import { btnPrimary, backLinkCls } from "@/lib/ui";

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
      <AlertTriangle className="w-10 h-10 text-amber-400" />
      <h1 className="text-xl font-bold text-white">Something went wrong</h1>
      <p className="text-[#8b8b9e] text-sm max-w-md">
        KeyProxy hit an unexpected error. This is usually a temporary issue with the
        database connection — try again, and if it keeps happening check that{" "}
        <code className="text-[#00C4B4]">DATABASE_URL</code> is set correctly.
      </p>
      <button onClick={reset} className={btnPrimary}>
        Try again
      </button>
      <a href="/" className={backLinkCls}>
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </a>
    </div>
  );
}
