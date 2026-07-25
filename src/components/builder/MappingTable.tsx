"use client";

import { useRef } from "react";
import { Select } from "../ui/Select";
import { TokenInput } from "./TokenInput";
import { Plus, X } from "../ui/Icon";
import type { TokenSuggestion } from "@/lib/engine/tokens";
import { TRANSFORMS, type OutputMapping, type Transform } from "@/lib/endpointTypes";
import { btnSecondary, btnIcon, inputCls, tableHeadRowCls, tableThCls } from "@/lib/ui";

/**
 * Row identity, for React only.
 *
 * The output field name would be the obvious key, but it is blank on a new row
 * and can be typed into a duplicate of an existing one, so one is minted here
 * instead and never written back into the definition. Keying by index hands a
 * removed row's open token popover and focus to the row below it.
 */
let rowSeq = 0;
const nextRowId = () => `row${(rowSeq += 1)}`;

/**
 * Maps this provider's response into the endpoint's shared output fields.
 *
 * This is what makes several differently-shaped APIs return one consistent
 * result — the normalization the whole feature promises.
 */
export function MappingTable({
  mappings,
  onChange,
  tokens,
  siblingFields,
}: {
  mappings: OutputMapping[];
  onChange: (mappings: OutputMapping[]) => void;
  tokens: TokenSuggestion[];
  /** Fields other steps produce, so gaps in this step are visible. */
  siblingFields: string[];
}) {
  // Mappings also arrive from outside (a JSON apply, or switching step), so the
  // id list is topped up against the incoming length, not only when adding.
  const idsRef = useRef<string[]>([]);
  if (idsRef.current.length !== mappings.length) {
    idsRef.current = mappings.map((_, i) => idsRef.current[i] ?? nextRowId());
  }
  const ids = idsRef.current;

  function update(index: number, patch: Partial<OutputMapping>) {
    onChange(mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function remove(index: number) {
    idsRef.current = idsRef.current.filter((_, i) => i !== index);
    onChange(mappings.filter((_, i) => i !== index));
  }

  const mine = new Set(mappings.map((m) => m.field).filter(Boolean));
  const missing = siblingFields.filter((field) => !mine.has(field));

  return (
    <div className="flex flex-col gap-3">
      {/*
        The endpoint's whole output shape, with anything this step doesn't
        produce called out. Computed from the draft, so it updates as you type.
      */}
      {(mine.size > 0 || missing.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {[...mine].map((field) => (
            <span
              key={field}
              className="text-[10px] font-mono px-2 py-0.5 rounded border bg-[#00C4B4]/15 text-[#00C4B4] border-[#00C4B4]/25"
            >
              {field}
            </span>
          ))}
          {missing.map((field) => (
            <span
              key={field}
              data-tip="Another step fills this field, but this one doesn't"
              className="text-[10px] font-mono px-2 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/25"
            >
              {field} · not mapped here
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={tableHeadRowCls}>
              <th scope="col" className={`${tableThCls} w-40`}>Output field</th>
              <th scope="col" className={tableThCls}>From</th>
              <th scope="col" className={`${tableThCls} w-48`}>Transform</th>
              <th scope="col" className="pb-3 w-11">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((mapping, index) => (
              <tr key={ids[index]}>
                <td className="py-1.5 pr-2 align-top">
                  <input
                    value={mapping.field}
                    onChange={(e) => update(index, { field: e.target.value })}
                    placeholder="email"
                    aria-label="Output field name"
                    spellCheck={false}
                    className={`${inputCls} font-mono text-xs`}
                  />
                </td>
                <td className="py-1.5 pr-2 align-top">
                  <TokenInput
                    value={mapping.from}
                    onChange={(v) => update(index, { from: v })}
                    tokens={tokens}
                    placeholder="{{response.body.data.email}}"
                    ariaLabel="Where the value comes from"
                  />
                </td>
                <td className="py-1.5 pr-2 align-top">
                  <Select
                    value={mapping.transform ?? "none"}
                    onChange={(v) => update(index, { transform: v as Transform })}
                    options={TRANSFORMS.map((t) => ({ value: t.value, label: t.label }))}
                    ariaLabel="Transform"
                  />
                </td>
                <td className="py-1.5 align-top">
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label={`Remove ${mapping.field || "field"}`}
                    data-tip="Remove field"
                    className={btnIcon}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mappings.length === 0 && (
        <p className="text-[#8b8b9e] text-xs">
          Nothing mapped yet. Without at least one field this step can&apos;t contribute to the result.
        </p>
      )}

      <button
        type="button"
        onClick={() =>
          onChange([...mappings, { field: "", from: "", transform: "none" as Transform }])
        }
        className={`${btnSecondary} gap-1.5 self-start`}
      >
        <Plus className="w-4 h-4" />
        Add field
      </button>
    </div>
  );
}
