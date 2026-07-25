"use client";

import { Select } from "../ui/Select";
import { Toggle } from "../ui/Toggle";
import { Plus, X } from "../ui/Icon";
import { INPUT_TYPES, type InputField, type InputType } from "@/lib/endpointTypes";
import {
  btnSecondary,
  btnIcon,
  cardCls,
  hintCls,
  inputCls,
  tableHeadRowCls,
  tableThCls,
} from "@/lib/ui";

/**
 * What callers send in.
 *
 * These names become the `{{input.…}}` tokens available to every step, and the
 * example values prefill the test runner, so declaring them up front is what
 * makes the rest of the builder able to autocomplete.
 */
export function InputSchemaEditor({
  inputs,
  onChange,
}: {
  inputs: InputField[];
  onChange: (inputs: InputField[]) => void;
}) {
  function update(index: number, patch: Partial<InputField>) {
    onChange(inputs.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  }

  return (
    <div className={cardCls}>
      <div>
        <h2 className="text-base font-semibold text-white">What callers send</h2>
        <p className={hintCls}>
          Each of these becomes a{" "}
          <code className="text-[#00C4B4]">{"{{input.name}}"}</code> you can use in any step.
        </p>
      </div>

      {inputs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={tableHeadRowCls}>
                <th scope="col" className={`${tableThCls} w-48`}>Name</th>
                <th scope="col" className={`${tableThCls} w-36`}>Type</th>
                <th scope="col" className={`${tableThCls} w-24`}>Required</th>
                <th scope="col" className={tableThCls}>Example</th>
                <th scope="col" className="pb-3 w-11">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {inputs.map((field, index) => (
                <tr key={index}>
                  <td className="py-1.5 pr-2 align-top">
                    <input
                      value={field.name}
                      onChange={(e) => update(index, { name: e.target.value })}
                      placeholder="domain"
                      aria-label="Input name"
                      spellCheck={false}
                      className={`${inputCls} font-mono text-xs`}
                    />
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    <Select
                      value={field.type}
                      onChange={(v) => update(index, { type: v as InputType })}
                      options={INPUT_TYPES.map((t) => ({ value: t, label: t }))}
                      ariaLabel="Input type"
                    />
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    <div className="min-h-[44px] flex items-center">
                      <Toggle
                        checked={field.required}
                        onChange={(v) => update(index, { required: v })}
                        label={`${field.name || "Input"} required`}
                      />
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    <input
                      value={field.example ?? ""}
                      onChange={(e) => update(index, { example: e.target.value })}
                      placeholder="acme.com"
                      aria-label="Example value"
                      className={inputCls}
                    />
                  </td>
                  <td className="py-1.5 align-top">
                    <button
                      type="button"
                      onClick={() => onChange(inputs.filter((_, i) => i !== index))}
                      aria-label={`Remove ${field.name || "input"}`}
                      data-tip="Remove input"
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
      )}

      {inputs.length === 0 && (
        <p className="text-[#8b8b9e] text-sm">
          No inputs declared yet. Add the fields your tool will send, like a domain or a name.
        </p>
      )}

      <button
        type="button"
        onClick={() =>
          onChange([...inputs, { name: "", type: "string", required: true, example: "" }])
        }
        className={`${btnSecondary} gap-1.5 self-start`}
      >
        <Plus className="w-4 h-4" />
        Add input
      </button>
    </div>
  );
}
