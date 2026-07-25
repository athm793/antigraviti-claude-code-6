"use client";

import { useState } from "react";
import { Copy, Check } from "./Icon";

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

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={ariaLabel}
      className={`text-xs transition-colors shrink-0 min-h-[44px] px-2 inline-flex items-center gap-1.5 ${
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
