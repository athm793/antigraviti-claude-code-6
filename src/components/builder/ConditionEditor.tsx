"use client";

import { Select } from "../ui/Select";
import { TokenInput } from "./TokenInput";
import { Plus, X } from "../ui/Icon";
import type { TokenSuggestion } from "@/lib/engine/tokens";
import {
  OPERATORS,
  UNARY_OPERATORS,
  type Operator,
  type Rule,
  type RuleLeaf,
} from "@/lib/endpointTypes";
import { btnSecondary, btnIcon, inputCls } from "@/lib/ui";

/**
 * Builds a flat all/any group of conditions.
 *
 * v1 authors one level. The stored shape allows nesting, so a definition
 * written by hand in the JSON view still runs — the visual editor just shows
 * such a group read-only rather than flattening and corrupting it.
 */

type Combinator = "all" | "any";

/** Where a condition reads from. Kept as a prefix on the stored path. */
const SOURCES = [
  { value: "response.body", label: "This step's response" },
  { value: "output", label: "This step's mapped output" },
  { value: "status", label: "This step's status code" },
  { value: "input", label: "Endpoint input" },
  { value: "steps", label: "An earlier step" },
] as const;

function splitPath(path: string): { source: string; rest: string } {
  if (path === "status" || path.startsWith("status.")) return { source: "status", rest: "" };
  for (const source of ["response.body", "output", "input", "steps"]) {
    if (path === source) return { source, rest: "" };
    if (path.startsWith(`${source}.`)) return { source, rest: path.slice(source.length + 1) };
  }
  return { source: "response.body", rest: path };
}

function joinPath(source: string, rest: string): string {
  if (source === "status") return "status";
  return rest ? `${source}.${rest}` : source;
}

function toLeaves(rule: Rule | null): { combinator: Combinator; leaves: RuleLeaf[] } | null {
  if (!rule) return { combinator: "all", leaves: [] };
  if ("all" in rule && rule.all.every(isLeaf)) {
    return { combinator: "all", leaves: rule.all as RuleLeaf[] };
  }
  if ("any" in rule && rule.any.every(isLeaf)) {
    return { combinator: "any", leaves: rule.any as RuleLeaf[] };
  }
  if (isLeaf(rule)) return { combinator: "all", leaves: [rule] };
  return null; // nested — not editable here
}

function isLeaf(rule: Rule): rule is RuleLeaf {
  return typeof (rule as RuleLeaf).path === "string";
}

export function ConditionEditor({
  rule,
  onChange,
  tokens,
  emptyLabel,
}: {
  rule: Rule | null;
  onChange: (rule: Rule | null) => void;
  tokens: TokenSuggestion[];
  emptyLabel: string;
}) {
  const parsed = toLeaves(rule);

  if (!parsed) {
    return (
      <div className="bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-3">
        <p className="text-[#8b8b9e] text-xs">
          This condition has nested groups, which the visual editor doesn&apos;t author yet.
          It still runs exactly as written — edit it in the JSON view.
        </p>
      </div>
    );
  }

  const { combinator, leaves } = parsed;

  function emit(nextCombinator: Combinator, nextLeaves: RuleLeaf[]) {
    if (nextLeaves.length === 0) {
      onChange(null);
      return;
    }
    onChange(
      nextCombinator === "all" ? { all: nextLeaves } : { any: nextLeaves }
    );
  }

  function updateLeaf(index: number, patch: Partial<RuleLeaf>) {
    const next = leaves.map((leaf, i) => (i === index ? { ...leaf, ...patch } : leaf));
    emit(combinator, next);
  }

  return (
    <div className="flex flex-col gap-2">
      {leaves.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[#8b8b9e]">
          Match
          <Select
            value={combinator}
            onChange={(v) => emit(v as Combinator, leaves)}
            options={[
              { value: "all", label: "all" },
              { value: "any", label: "any" },
            ]}
            ariaLabel="Match all or any of these conditions"
            className="w-24"
          />
          of these:
        </div>
      )}

      {leaves.map((leaf, index) => {
        const { source, rest } = splitPath(leaf.path);
        const unary = UNARY_OPERATORS.has(leaf.op);
        const needsField = source !== "status";

        return (
          <div
            key={index}
            className="grid grid-cols-1 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,10rem)_minmax(0,1fr)_44px] gap-2 items-start"
          >
            <Select
              value={source}
              onChange={(v) => updateLeaf(index, { path: joinPath(v, rest) })}
              options={SOURCES.map((s) => ({ value: s.value, label: s.label }))}
              ariaLabel="Where to read from"
            />

            {needsField ? (
              <TokenInput
                value={rest}
                onChange={(v) => updateLeaf(index, { path: joinPath(source, v) })}
                tokens={tokens}
                placeholder={source === "steps" ? "prospeo.output.email" : "email"}
                ariaLabel="Field to check"
              />
            ) : (
              <div className="min-h-[44px] flex items-center text-xs text-[#4a4a58] px-1">
                status code
              </div>
            )}

            <Select
              value={leaf.op}
              onChange={(v) => {
                const op = v as Operator;
                // Dropping the value when switching to a unary operator keeps
                // the stored rule honest — a leftover value would be ignored
                // at run time but still show in the JSON view.
                updateLeaf(index, UNARY_OPERATORS.has(op) ? { op, value: undefined } : { op });
              }}
              options={OPERATORS.map((o) => ({ value: o.value, label: o.label }))}
              ariaLabel="Comparison"
            />

            {/*
              The value column keeps its grid track even for operators that
              take no value, so switching from "equals" to "is empty" doesn't
              shift every control on the row.
            */}
            {unary ? (
              <div aria-hidden="true" />
            ) : (
              <input
                value={leaf.value === undefined ? "" : String(leaf.value)}
                onChange={(e) => updateLeaf(index, { value: e.target.value })}
                placeholder="value"
                aria-label="Value to compare against"
                className={inputCls}
              />
            )}

            <button
              type="button"
              onClick={() => emit(combinator, leaves.filter((_, i) => i !== index))}
              aria-label="Remove this condition"
              title="Remove condition"
              className={btnIcon}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}

      {leaves.length === 0 && <p className="text-[#8b8b9e] text-xs">{emptyLabel}</p>}

      <button
        type="button"
        onClick={() =>
          emit(combinator, [
            ...leaves,
            { path: "response.body.email", op: "not_empty" as Operator },
          ])
        }
        className={`${btnSecondary} gap-1.5 self-start`}
      >
        <Plus className="w-4 h-4" />
        Add condition
      </button>
    </div>
  );
}
