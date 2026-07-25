"use client";

import type { ReactNode } from "react";
import { MERGE_MODES, type MergeMode, type StepDef } from "@/lib/endpointTypes";
import { Select } from "../ui/Select";
import { Split, AlertTriangle } from "../ui/Icon";
import { hintCls, labelCls } from "@/lib/ui";

/**
 * A stage whose steps run at the same time.
 *
 * Rendered as a container rather than a per-step flag because that's what it
 * is — the members are unordered, which is why they get letters instead of
 * numbers. Someone reading a numbered list top to bottom would reasonably
 * assume 3 runs after 2, and inside a group that isn't true.
 */
export function ParallelGroup({
  members,
  mode,
  onModeChange,
  children,
}: {
  members: StepDef[];
  mode: MergeMode;
  onModeChange: (mode: MergeMode) => void;
  children: ReactNode;
}) {
  const enabled = members.filter((m) => m.enabled !== false);
  const known = enabled.filter((m) => m.cost_per_call_cents != null);
  const totalCents = known.reduce((sum, m) => sum + (m.cost_per_call_cents ?? 0), 0);

  return (
    <div className="border border-[#00C4B4]/25 bg-[#00C4B4]/[0.03] rounded-xl p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <Split className="w-4 h-4 text-[#00C4B4]" />
          These {enabled.length} run at the same time
        </span>

        <div className="flex items-center gap-2">
          <span className={labelCls}>Take</span>
          <Select
            value={mode}
            onChange={(value) => onModeChange(value as MergeMode)}
            options={MERGE_MODES.map((m) => ({ value: m.value, label: m.label }))}
            ariaLabel="What to do with the results of this group"
            className="w-64"
          />
        </div>

        <div className="flex-1" />

        {/*
          Stated up front, because this is the expensive misunderstanding:
          running in parallel doesn't try them until one works, it asks all of
          them, every time, and you are billed by all of them.
        */}
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {known.length === enabled.length && totalCents > 0
            ? `About ${(totalCents / 100).toFixed(2)} per run — every one of them is called`
            : `${enabled.length}× the cost of one step — every one of them is called, every time`}
        </span>
      </div>

      <div className="flex flex-col gap-3">{children}</div>

      {mode === "first_success" && (
        <p className={hintCls}>
          The result is whichever of these answers, taken in the order they&apos;re listed
          here — never whichever replies first, so the same inputs always give the same answer.
        </p>
      )}
    </div>
  );
}
