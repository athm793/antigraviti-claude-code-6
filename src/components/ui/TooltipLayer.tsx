"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * One tooltip for the whole app, driven by a `data-tip` attribute.
 *
 * Native `title` tooltips are the wrong tool three times over: they take a
 * second to appear, they never appear for keyboard focus, and they can't be
 * styled to match anything. Rather than wrapping sixty-odd controls in a
 * component, this listens once at the document level — any element carrying
 * `data-tip` gets an on-design tooltip on hover AND focus, portal-rendered so
 * no `overflow` ancestor can clip it, flipped below the anchor when there's
 * no room above.
 *
 * Mounted once in the root layout. `aria-label`s stay on the controls
 * themselves — this is the visual affordance, not the accessible name.
 */

const SHOW_DELAY_MS = 300;

interface TipState {
  text: string;
  top: number;
  left: number;
  /** True when the tip renders below the anchor (no room above). */
  flipped: boolean;
}

export function TooltipLayer() {
  const [tip, setTip] = useState<TipState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = useRef<Element | null>(null);

  useEffect(() => {
    function findTarget(node: EventTarget | null): HTMLElement | null {
      return node instanceof Element ? (node.closest("[data-tip]") as HTMLElement | null) : null;
    }

    function show(target: HTMLElement, immediate: boolean) {
      const text = target.getAttribute("data-tip");
      if (!text) return;
      anchor.current = target;
      if (timer.current) clearTimeout(timer.current);

      const place = () => {
        // Re-read the rect at fire time — the layout may have shifted.
        if (anchor.current !== target || !target.isConnected) return;
        const box = target.getBoundingClientRect();
        const flipped = box.top < 44;
        setTip({
          text,
          top: flipped ? box.bottom + 8 : box.top - 8,
          left: Math.min(Math.max(box.left + box.width / 2, 12), window.innerWidth - 12),
          flipped,
        });
      };

      // Focus shows immediately: a keyboard user has already committed to the
      // control, and a delay would just feel broken.
      if (immediate) place();
      else timer.current = setTimeout(place, SHOW_DELAY_MS);
    }

    function hide(node: EventTarget | null) {
      const target = findTarget(node);
      if (target !== anchor.current) return;
      anchor.current = null;
      if (timer.current) clearTimeout(timer.current);
      setTip(null);
    }

    const onOver = (e: MouseEvent) => {
      const target = findTarget(e.target);
      if (target && target !== anchor.current) show(target, false);
    };
    const onOut = (e: MouseEvent) => hide(e.target);
    const onFocus = (e: FocusEvent) => {
      const target = findTarget(e.target);
      if (target) show(target, true);
    };
    const onBlur = (e: FocusEvent) => hide(e.target);
    // Scrolling detaches the tip from its anchor; drop it rather than chase.
    const onScroll = () => {
      anchor.current = null;
      if (timer.current) clearTimeout(timer.current);
      setTip(null);
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener("scroll", onScroll, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!tip) return null;

  return createPortal(
    <div
      role="tooltip"
      className={`fixed z-[70] pointer-events-none -translate-x-1/2 ${
        tip.flipped ? "" : "-translate-y-full"
      } kp-overlay-in`}
      style={{ top: tip.top, left: tip.left }}
    >
      <div className="bg-[#1c1c28] border border-[#363650] rounded-lg px-3 py-1.5 text-xs text-[#e8e8f0] shadow-xl shadow-black/40 max-w-[18rem] text-center">
        {tip.text}
      </div>
    </div>,
    document.body
  );
}
