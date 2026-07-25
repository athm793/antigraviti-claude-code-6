"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "./Icon";
import { focusRingCls } from "@/lib/ui";

/**
 * Consolidates three near-identical copy handlers that lived in ConfigCard,
 * CurlExample and MasterKeyDisplay.
 *
 * The label slot is fixed-width: "Copy" -> "Copied!" is a 3-character swap
 * that would otherwise resize the button mid-interaction.
 */
export function CopyButton({
  value,
  ariaLabel,
  showLabel = true,
  className = "",
}: {
  value: string;
  ariaLabel: string;
  showLabel?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The reset is scheduled from a click, so the button can unmount (dialog
  // closed, list refreshed) before it fires.
  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={ariaLabel}
      // min-w-[44px] as well as min-h: without a label this is an icon button,
      // and the icon alone left the tap target at 30px wide.
      className={`text-xs transition-colors shrink-0 min-h-[44px] min-w-[44px] px-2 inline-flex items-center justify-center gap-1.5 rounded-lg kp-press ${focusRingCls} ${
        state === "failed"
          ? "text-red-400"
          : "text-[#00C4B4] hover:text-white"
      } ${className}`}
    >
      {state === "copied" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {showLabel && (
        <span className="min-w-[5.5rem] text-left">
          {state === "copied"
            ? "Copied"
            : state === "failed"
              ? "Copy manually"
              : "Copy"}
        </span>
      )}
    </button>
  );
}
