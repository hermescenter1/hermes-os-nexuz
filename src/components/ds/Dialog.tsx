"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { useOverlayBehavior } from "./overlay";

export type DialogSize = "sm" | "md" | "lg";

const SIZE: Record<DialogSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  className?: string;
}

/**
 * Dialog — modal shell (E4). Focus is trapped inside and restored on close,
 * Escape and backdrop click close it, and it is labelled/described by its
 * title/description for screen readers. Portal + mount-gate keep it SSR-safe.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", className }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
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
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
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
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full rounded-lg border border-border-default bg-surface-elevated shadow-e4 outline-none",
          SIZE[size],
          className,
        )}
      >
        {(title || description) && (
          <div className="flex flex-col gap-1 border-b border-border-default p-5">
            {title ? (
              <h2 id={titleId} className="text-title-lg font-semibold text-text-primary">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descId} className="text-body text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
        )}
        {children ? <div className="p-5 text-body text-text-secondary">{children}</div> : null}
        {footer ? <div className="flex justify-end gap-3 border-t border-border-default p-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
