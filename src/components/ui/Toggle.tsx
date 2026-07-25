"use client";

import { focusRingCls } from "@/lib/ui";

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name. Required — a bare switch is unusable without one. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed kp-press ${focusRingCls}`}
    >
      <span
        className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${
          checked ? "bg-[#00C4B4]" : "bg-[#2a2a38]"
        }`}
      >
        <span
          className={`w-4 h-4 rounded-full bg-white motion-safe:transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
