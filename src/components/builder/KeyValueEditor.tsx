"use client";

import { TokenInput } from "./TokenInput";
import { Plus, X } from "../ui/Icon";
import type { TokenSuggestion } from "@/lib/engine/tokens";
import { btnSecondary, btnIcon, inputCls } from "@/lib/ui";

export function KeyValueEditor({
  rows,
  onChange,
  tokens,
  keyPlaceholder,
  valuePlaceholder,
  addLabel,
  emptyLabel,
}: {
  rows: { key: string; value: string }[];
  onChange: (rows: { key: string; value: string }[]) => void;
  tokens: TokenSuggestion[];
  keyPlaceholder: string;
  valuePlaceholder: string;
  addLabel: string;
  emptyLabel: string;
}) {
  function update(index: number, patch: Partial<{ key: string; value: string }>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && <p className="text-[#8b8b9e] text-xs">{emptyLabel}</p>}

      {rows.map((row, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_44px] gap-2 items-start"
        >
          <input
            value={row.key}
            onChange={(e) => update(index, { key: e.target.value })}
            placeholder={keyPlaceholder}
            aria-label="Name"
            spellCheck={false}
            className={`${inputCls} font-mono text-xs`}
          />
          <TokenInput
            value={row.value}
            onChange={(v) => update(index, { value: v })}
            tokens={tokens}
            placeholder={valuePlaceholder}
            ariaLabel="Value"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            aria-label={`Remove ${row.key || "row"}`}
            data-tip="Remove"
            className={btnIcon}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...rows, { key: "", value: "" }])}
        className={`${btnSecondary} gap-1.5 self-start`}
      >
        <Plus className="w-4 h-4" />
        {addLabel}
      </button>
    </div>
  );
}
