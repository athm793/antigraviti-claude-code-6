"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConfigWithStats } from "@/lib/types";
import type { EndpointDefinition } from "@/lib/endpointTypes";
import { validateEndpointDefinition, type Issue } from "@/lib/engine/validate";
import { CopyButton } from "../ui/CopyButton";
import { Download, Upload, Check, AlertTriangle } from "../ui/Icon";
import {
  btnPrimary,
  btnSecondary,
  cardCls,
  hintCls,
  labelCls,
  textareaCls,
} from "@/lib/ui";

/**
 * The definition as text.
 *
 * Visual to JSON is live. JSON to visual needs an explicit Apply — parsing on
 * every keystroke means a half-typed brace is invalid JSON, and treating that
 * as "the definition is now empty" would wipe the visual editor while someone
 * is mid-edit.
 *
 * Validated by the same `validateEndpointDefinition` the builder and the write
 * route use. If the three disagreed you'd get definitions that paste in fine
 * and then refuse to save.
 */
export function JsonView({
  definition,
  providers,
  onApply,
  slug,
}: {
  definition: EndpointDefinition;
  providers: ConfigWithStats[];
  onApply: (definition: EndpointDefinition) => void;
  slug: string;
}) {
  const serialised = useMemo(() => JSON.stringify(definition, null, 2), [definition]);

  const [text, setText] = useState(serialised);
  const [applied, setApplied] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = text !== serialised;

  /**
   * Re-seed when the definition changes underneath — but never over unapplied
   * edits.
   *
   * Keyed on the last value seeded rather than on a dependency list, so it
   * reacts to the *incoming* definition and not to typing here. If someone has
   * unsaved text and the builder moves on (their own Apply, or a step edited
   * in the visual view), the text is left alone and the mismatch is called out
   * instead. Silently overwriting what someone typed is the worst version of
   * this, and silently applying stale JSON over a newer builder state is the
   * second worst.
   */
  const lastSeeded = useRef(serialised);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (lastSeeded.current === serialised) return;
    const hadEdits = text !== lastSeeded.current;
    lastSeeded.current = serialised;
    if (hadEdits) {
      setStale(true);
      return;
    }
    setText(serialised);
    setStale(false);
  }, [serialised, text]);

  /** Live feedback only. Never applied. */
  const liveError = useMemo(() => {
    if (!text.trim()) return "Empty";
    try {
      JSON.parse(text);
      return "";
    } catch (err) {
      return err instanceof Error ? err.message : "Not valid JSON";
    }
  }, [text]);

  function apply() {
    setApplied(false);
    setIssues([]);
    setParseError("");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "That isn't valid JSON");
      return;
    }

    const result = validateEndpointDefinition(parsed);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }

    setIssues(result.issues.filter((i) => i.severity === "warning"));
    setStale(false);
    onApply(result.value);
    setApplied(true);
  }

  /**
   * Provider ids don't travel.
   *
   * A definition pasted in from somewhere else names providers by id, and those
   * ids mean nothing in this account. The save route already refuses them —
   * this says so up front, with which steps, instead of letting someone edit
   * for ten minutes and find out at the end.
   */
  const foreignSteps = useMemo(() => {
    const known = new Set(providers.map((p) => p.id));
    return (definition.steps ?? [])
      .filter((step) => step.config_id && !known.has(step.config_id))
      .map((step) => step.name || step.key);
  }, [definition.steps, providers]);

  function download() {
    const blob = new Blob([JSON.stringify(definition, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug || "waterfall"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      // Loaded into the editor, not applied. Reading a file is not consent to
      // replace what's on screen with it.
      setText(String(reader.result ?? ""));
      setApplied(false);
      setIssues([]);
      setParseError("");
    };
    reader.readAsText(file);
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">Definition JSON</h2>
          <p className={hintCls}>
            Edit, paste in a waterfall from somewhere else, or save a copy. Changes here only
            reach the builder when you click Apply.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <CopyButton value={text} ariaLabel="Copy definition JSON" />
          <button type="button" onClick={download} className={`${btnSecondary} gap-1.5`}>
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`${btnSecondary} gap-1.5`}
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import a definition file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importFile(file);
              // Reset so re-picking the same file fires change again.
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="definition-json" className={labelCls}>
          Definition
        </label>
        <textarea
          id="definition-json"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setApplied(false);
          }}
          rows={24}
          spellCheck={false}
          className={`${textareaCls} text-xs`}
        />
        {/* Reserved line: the status appearing must not push the buttons down. */}
        <p
          className={`text-xs min-h-[16px] ${
            liveError ? "text-amber-400" : dirty ? "text-[#8b8b9e]" : "text-[#4a4a58]"
          }`}
        >
          {liveError
            ? `Not valid JSON yet — ${liveError}`
            : dirty
              ? "Valid JSON. Click Apply to load it into the builder."
              : "Matches the builder."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={apply}
          disabled={!dirty || Boolean(liveError)}
          title={liveError ? "Fix the JSON first" : !dirty ? "Nothing to apply" : undefined}
          className={`${btnPrimary} gap-2 min-w-[9rem]`}
        >
          Apply to builder
        </button>
        <button
          type="button"
          onClick={() => {
            setText(serialised);
            lastSeeded.current = serialised;
            setIssues([]);
            setParseError("");
            setApplied(false);
            setStale(false);
          }}
          disabled={!dirty}
          className={btnSecondary}
        >
          Discard changes
        </button>
        {/* Fixed slot so the confirmation can't shift the buttons. */}
        <span className="text-[#00C4B4] text-sm min-w-[10rem] inline-flex items-center gap-1.5">
          {applied && errors.length === 0 && (
            <>
              <Check className="w-4 h-4" />
              Loaded into the builder
            </>
          )}
        </span>
      </div>

      {stale && (
        <div className="bg-amber-500/[0.06] border border-amber-500/25 rounded-lg p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[#c8c8d8] text-xs">
            The builder has changed since you started editing here, so this text is out of date.
            Applying it would undo that change. Discard to reload the current definition.
          </p>
        </div>
      )}

      {parseError && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {parseError}
        </p>
      )}

      {errors.length > 0 && (
        <div className="bg-red-500/[0.06] border border-red-500/25 rounded-lg p-4 flex flex-col gap-1">
          <p className="text-red-400 text-sm font-medium">
            {errors.length} thing{errors.length === 1 ? "" : "s"} to fix before this can be used
          </p>
          {errors.map((issue, i) => (
            <p key={i} className="text-[#c8c8d8] text-xs">
              <span className="font-mono text-[#8b8b9e]">{issue.path || "definition"}</span>{" "}
              {issue.message}
            </p>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-amber-500/[0.06] border border-amber-500/25 rounded-lg p-4 flex flex-col gap-1">
          <p className="text-amber-400 text-sm font-medium">Worth checking</p>
          {warnings.map((issue, i) => (
            <p key={i} className="text-[#c8c8d8] text-xs">
              {issue.message}
            </p>
          ))}
        </div>
      )}

      {foreignSteps.length > 0 && (
        <div className="bg-amber-500/[0.06] border border-amber-500/25 rounded-lg p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[#c8c8d8] text-xs">
            {foreignSteps.length} step{foreignSteps.length === 1 ? "" : "s"} (
            {foreignSteps.join(", ")}) point at providers that don&apos;t exist in this account.
            Provider ids don&apos;t travel between accounts — pick a replacement for each on the
            Build tab before saving.
          </p>
        </div>
      )}
    </div>
  );
}
