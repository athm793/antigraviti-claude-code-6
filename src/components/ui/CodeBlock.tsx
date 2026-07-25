"use client";

import type { ReactNode } from "react";
import { CopyButton } from "./CopyButton";

/**
 * Bordered code panel with a header bar and copy action — the chrome
 * CurlExample established, extracted so the waterfall builder's JSON views,
 * request previews and run traces all render identically.
 *
 * Content scrolls inside its own container. A wide JSON blob must never make
 * the page itself scroll sideways.
 */
export function CodeBlock({
  title,
  code,
  copyLabel,
  maxHeight = "24rem",
  footer,
}: {
  title: string;
  code: string;
  copyLabel?: string;
  maxHeight?: string;
  footer?: ReactNode;
}) {
  return (
    <div className="bg-[#0a0a10] border border-[#2a2a38] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#2a2a38]">
        <span className="text-[#8b8b9e] text-xs font-medium truncate">{title}</span>
        <CopyButton
          value={code}
          ariaLabel={copyLabel ?? `Copy ${title}`}
          className="-my-2.5"
        />
      </div>
      <pre
        className="p-4 text-xs font-mono text-[#c8c8d8] overflow-auto whitespace-pre leading-relaxed"
        style={{ maxHeight }}
      >
        {code}
      </pre>
      {footer && <div className="px-4 pb-3 text-xs text-[#8b8b9e]">{footer}</div>}
    </div>
  );
}

/** Convenience wrapper for values that are already objects. */
export function JsonBlock({
  title,
  value,
  maxHeight,
  footer,
}: {
  title: string;
  value: unknown;
  maxHeight?: string;
  footer?: ReactNode;
}) {
  let code: string;
  try {
    code = JSON.stringify(value, null, 2) ?? "null";
  } catch {
    // Circular or otherwise unserialisable — show something rather than crash
    // the whole panel, since this renders untrusted upstream payloads.
    code = "// Value could not be displayed as JSON";
  }

  return <CodeBlock title={title} code={code} maxHeight={maxHeight} footer={footer} />;
}
