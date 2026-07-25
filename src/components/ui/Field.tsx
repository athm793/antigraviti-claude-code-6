"use client";

import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import { labelCls, hintCls } from "@/lib/ui";

/**
 * Label + control + hint, with the id wiring done for you.
 *
 * Replaces two byte-identical local copies (configs/new/page.tsx and
 * EditConfigForm.tsx) and adds the `error` slot neither had — previously a
 * failed field had no way to describe itself to a screen reader.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const child = isValidElement(children)
    ? cloneElement(
        children as React.ReactElement<{
          id?: string;
          "aria-describedby"?: string;
          "aria-invalid"?: boolean;
        }>,
        {
          id,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        }
      )
    : children;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {child}
      {error && (
        <p id={errorId} className="text-red-400 text-xs">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className={hintCls}>
          {hint}
        </p>
      )}
    </div>
  );
}
