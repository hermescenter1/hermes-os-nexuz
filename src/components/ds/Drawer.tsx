"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { useOverlayBehavior } from "./overlay";

/** Logical side: `start`/`end` mirror correctly under RTL. */
export type DrawerSide = "start" | "end";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Which inline edge the sheet is anchored to. Default `end`. */
  side?: DrawerSide;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Panel width (px or CSS length). Default 360. */
  width?: number | string;
  className?: string;
}

/**
 * Drawer — sheet shell (E3). Anchored to an inline edge (`start`/`end`) so it
 * appears on the correct side under both LTR and RTL. Same focus-trap / Escape
 * / backdrop behaviour as Dialog; portal + mount-gate keep it SSR-safe.
 */
export function Drawer({ open, onClose, side = "end", title, children, footer, width = 360, className }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useOverlayBehavior({ open, onClose, panelRef });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/60" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        style={{ width, maxWidth: "100%" }}
        className={cn(
          "absolute inset-y-0 flex flex-col border-border-default bg-surface-elevated shadow-e3 outline-none",
          side === "start" ? "start-0 border-e" : "end-0 border-s",
          className,
        )}
      >
        {title ? (
          <div className="border-b border-border-default p-5">
            <h2 id={titleId} className="text-title-lg font-semibold text-text-primary">
              {title}
            </h2>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto p-5 text-body text-text-secondary">{children}</div>
        {footer ? <div className="flex justify-end gap-3 border-t border-border-default p-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
