"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TokenSuggestion } from "@/lib/engine/tokens";
import { Popover, isInsidePopover } from "../ui/Popover";
import { inputCls, inputInvalidCls } from "@/lib/ui";

/**
 * Text field with `{{`-triggered autocomplete over the tokens valid at this
 * step's position.
 *
 * Renders a plain input — tokens stay as literal text rather than becoming
 * editable pills. That's a deliberate scope call: a pill editor is a large
 * amount of contenteditable work and a steady source of caret bugs, and mono
 * text with autocomplete plus save-time validation covers nearly all of the
 * value.
 */
export function TokenInput({
  value,
  onChange,
  tokens,
  placeholder,
  invalid = false,
  mono = true,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  tokens: TokenSuggestion[];
  placeholder?: string;
  invalid?: boolean;
  mono?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const id = useId();
  const listId = `${id}-tokens`;
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const matches = open
    ? tokens.filter((t) => t.token.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      // The suggestion list is portalled, so it is not inside rootRef.
      if (isInsidePopover(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  /** Reads the partial token immediately before the caret, if any. */
  function openBraceQuery(text: string, caret: number): string | null {
    const before = text.slice(0, caret);
    const start = before.lastIndexOf("{{");
    if (start === -1) return null;
    const fragment = before.slice(start + 2);
    // Already closed, so we're no longer inside a token.
    if (fragment.includes("}}")) return null;
    return fragment;
  }

  function handleChange(next: string) {
    onChange(next);
    const caret = inputRef.current?.selectionStart ?? next.length;
    const fragment = openBraceQuery(next, caret);
    if (fragment === null) {
      setOpen(false);
      return;
    }
    setQuery(fragment.trim());
    setActive(0);
    setOpen(true);
  }

  function insert(token: string) {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const start = before.lastIndexOf("{{");
    const head = start === -1 ? `${before}{{` : before.slice(0, start + 2);
    const next = `${head}${token}}}${value.slice(caret)}`;

    onChange(next);
    setOpen(false);

    // Put the caret after the inserted token, so typing continues naturally.
    requestAnimationFrame(() => {
      const position = head.length + token.length + 2;
      input?.focus();
      input?.setSelectionRange(position, position);
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open || matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insert(matches[active].token);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        spellCheck={false}
        className={`${invalid ? inputInvalidCls : inputCls} ${mono ? "font-mono text-xs" : ""}`}
      />

      <Popover
        anchorRef={inputRef}
        open={open && matches.length > 0}
        id={listId}
        role="listbox"
        ariaLabel="Available data"
        maxHeight={224}
      >
        <div>
          {matches.map((match, index) => (
            <div
              key={match.token}
              role="option"
              aria-selected={index === active}
              onClick={() => insert(match.token)}
              onMouseEnter={() => setActive(index)}
              className={`px-3 py-2 cursor-pointer ${index === active ? "bg-[#15151f]" : ""}`}
            >
              <div className="text-xs font-mono text-[#00C4B4] truncate">{match.token}</div>
              <div className="text-[10px] text-[#8b8b9e] truncate">
                {match.group}
                {match.hint ? ` · ${match.hint}` : ""}
              </div>
            </div>
          ))}
        </div>
      </Popover>
    </div>
  );
}
