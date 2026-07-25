"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** True when an event happened inside any portalled popover panel. */
export function isInsidePopover(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-popover]"));
}

/**
 * Floating panel rendered into a portal and positioned against its anchor.
 *
 * A popover positioned `absolute` inside its trigger gets clipped the moment
 * any ancestor scrolls or hides overflow — which happens constantly here,
 * since the mapping and input tables are wrapped in `overflow-x-auto` for
 * mobile. Portalling to the body and positioning with a measured rect is the
 * only version that survives that.
 *
 * Flips above the anchor when there isn't room below, and repositions on
 * scroll and resize so it can't drift away from its trigger.
 */
export function Popover({
  anchorRef,
  open,
  children,
  maxHeight = 256,
  className = "",
  id,
  role,
  ariaLabel,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  children: ReactNode;
  maxHeight?: number;
  className?: string;
  id?: string;
  role?: string;
  ariaLabel?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  /**
   * The panel outlives `open` by one short exit animation, so dismissing a
   * dropdown fades it out instead of snapping it away. Reduced motion cuts
   * the animation to ~0ms globally, making the delay imperceptible.
   */
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
      return;
    }
    if (!visible) return;
    setClosing(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [open, visible]);

  useLayoutEffect(() => {
    if (!visible) return;

    function position() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const box = anchor.getBoundingClientRect();
      const below = window.innerHeight - box.bottom;
      const flip = below < maxHeight + 16 && box.top > below;
      setRect({
        top: flip ? box.top - Math.min(maxHeight, box.top - 8) - 4 : box.bottom + 4,
        left: box.left,
        width: box.width,
      });
    }

    position();
    // `true` captures scrolls on any ancestor, not just the window — the panel
    // has to follow a trigger inside a scrolling table.
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [visible, anchorRef, maxHeight]);

  if (!mounted || !visible || !rect) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role={role}
      aria-label={ariaLabel}
      // Lets outside-click handlers recognise the panel as "inside", even
      // though the portal puts it outside the trigger's DOM subtree. Without
      // this, pointerdown closes the panel before a click on an option lands.
      data-popover="true"
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        maxHeight,
        zIndex: 60,
      }}
      className={`overflow-y-auto bg-[#111118] border border-[#2a2a38] rounded-lg shadow-xl shadow-black/40 py-1 ${
        closing ? "kp-panel-out" : "kp-panel-in"
      } ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}
