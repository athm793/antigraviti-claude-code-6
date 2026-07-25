"use client";

import { useEffect, useRef, useState } from "react";
import { btnDanger, btnSecondary } from "@/lib/ui";

/** How long the exit animation runs before the modal actually unmounts. */
const EXIT_MS = 100;

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

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
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
