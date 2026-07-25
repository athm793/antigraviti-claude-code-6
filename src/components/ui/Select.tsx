"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Check } from "./Icon";
import { Popover, isInsidePopover } from "./Popover";
import { inputCls, inputInvalidCls } from "@/lib/ui";

/**
 * On-design dropdown.
 *
 * The app shipped with zero <select> elements, so there was no precedent to
 * follow and a bare native select can't be styled to match this UI. This is
 * the full combobox pattern — keyboard, ARIA, type-ahead — because a dropdown
 * that only works with a mouse fails as soon as someone tabs into it.
 *
 * The list renders through Popover, i.e. in a portal: these appear inside
 * tables wrapped in overflow-x-auto, which would otherwise clip the panel and
 * add a stray scrollbar.
 */

export type SelectOption = {
  value: string;
  label: string;
  /** Second line in the option row — a base URL, a description. */
  hint?: string;
  disabled?: boolean;
  /** Why this option can't be picked. Surfaces as a title on hover. */
  disabledReason?: string;
  badge?: ReactNode;
};

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  ariaLabel,
  id,
  disabled = false,
  invalid = false,
  footer,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  const generatedId = useId();
  const triggerId = id ?? `select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });

  const selected = options.find((o) => o.value === value) ?? null;
  const firstEnabled = options.findIndex((o) => !o.disabled);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setActiveIndex(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openList = useCallback(() => {
    if (disabled) return;
    const selectedIndex = options.findIndex((o) => o.value === value && !o.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabled);
    setOpen(true);
  }, [disabled, options, value, firstEnabled]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      if (isInsidePopover(event.target)) return;
      close(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Keep the active option scrolled into view during keyboard navigation.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function step(from: number, direction: 1 | -1): number {
    const count = options.length;
    for (let i = 1; i <= count; i++) {
      const next = (from + direction * i + count * count) % count;
      if (!options[next]?.disabled) return next;
    }
    return from;
  }

  function pick(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  }

  /**
   * All keys are handled here, not on the listbox: focus stays on the trigger
   * for the whole interaction and the active option is communicated through
   * aria-activedescendant. A handler on the popover would never fire.
   */
  function onTriggerKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close(true);
        return;
      case "Tab":
        close(false);
        return;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => step(i < 0 ? -1 : i, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => step(i < 0 ? 0 : i, -1));
        return;
      case "Home":
        event.preventDefault();
        setActiveIndex(firstEnabled);
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(step(0, -1));
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(activeIndex);
        return;
    }

    // Type-ahead: consecutive letters within a second build a search string.
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now();
      const state = typeahead.current;
      state.buffer = now - state.at > 1000 ? event.key : state.buffer + event.key;
      state.at = now;

      const query = state.buffer.toLowerCase();
      const match = options.findIndex(
        (o) => !o.disabled && o.label.toLowerCase().startsWith(query)
      );
      if (match >= 0) setActiveIndex(match);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${triggerId}-opt-${activeIndex}` : undefined
        }
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        className={`${invalid ? inputInvalidCls : inputCls} flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className={`truncate ${selected ? "text-white" : "text-[#4a4a58]"}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-[#8b8b9e] shrink-0" />
      </button>

      <Popover
        anchorRef={triggerRef}
        open={open}
        id={listboxId}
        role="listbox"
        ariaLabel={ariaLabel}
      >
        <div ref={listRef}>
          {options.length === 0 && (
            <div className="px-3 py-3 text-sm text-[#8b8b9e]">No options</div>
          )}

          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <div
                key={option.value}
                id={`${triggerId}-opt-${index}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                title={option.disabled ? option.disabledReason : undefined}
                onClick={() => pick(index)}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                className={`min-h-[44px] px-3 flex items-center gap-2 cursor-pointer ${
                  option.disabled
                    ? "opacity-40 cursor-not-allowed"
                    : isActive
                      ? "bg-[#15151f]"
                      : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{option.label}</div>
                  {option.hint && (
                    <div className="text-xs text-[#8b8b9e] font-mono truncate">
                      {option.hint}
                    </div>
                  )}
                </div>
                {option.badge}
                {isSelected && <Check className="w-4 h-4 text-[#00C4B4] shrink-0" />}
              </div>
            );
          })}

          {footer && (
            <div className="border-t border-[#1a1a28] mt-1 pt-1">{footer}</div>
          )}
        </div>
      </Popover>
    </div>
  );
}
