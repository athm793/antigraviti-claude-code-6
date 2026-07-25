"use client";

import { useEffect, useRef, useState } from "react";
import { btnDanger, btnSecondary } from "@/lib/ui";

/** How long the exit animation runs before the modal actually unmounts. */
const EXIT_MS = 100;

/** Everything inside the dialog that Tab can reach. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  /**
   * Mounted outlives `open` by one exit animation: an overlay that vanishes
   * the frame it's dismissed reads as the app flinching. Under reduced motion
   * the animations are globally cut to ~0ms, so the delay is imperceptible.
   */
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const timer = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [open, mounted]);

  /**
   * Focus has to wait for `mounted`: on the render where `open` flips true the
   * dialog isn't in the DOM yet, so the ref is still null and focusing it there
   * silently does nothing. Depending on `mounted` re-runs this once the markup
   * actually exists.
   */
  useEffect(() => {
    if (!open || !mounted) return;
    // Remember the trigger before moving focus, so dismissing puts the caret
    // back where the user left it rather than at the top of the document.
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;

      // aria-modal alone doesn't take the rest of the page out of the tab
      // order, so without this Tab walks out of the dialog and onto controls
      // the user can't even see behind the overlay.
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const outside = !(active instanceof Node) || !dialog.contains(active);

      if (e.shiftKey && (outside || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (outside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    // Scroll lock. A page that scrolls behind a modal is disorienting, and on
    // touch it can carry the dialog itself off screen.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onCancel]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 ${
        closing ? "kp-overlay-out" : "kp-overlay-in"
      }`}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
        className={`bg-[#111118] border border-[#2a2a38] rounded-xl p-6 max-w-sm w-full flex flex-col gap-4 ${
          closing ? "kp-panel-out" : "kp-panel-in"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-modal-title" className="text-base font-semibold text-white">
          {title}
        </h2>
        <p id="confirm-modal-message" className="text-sm text-[#c8c8d8]">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} onClick={onCancel} className={btnSecondary}>
            Cancel
          </button>
          <button onClick={onConfirm} className={btnDanger}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
