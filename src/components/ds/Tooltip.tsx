"use client";

import { cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "./cn";

export interface TooltipProps {
  content: ReactNode;
  /** Single interactive trigger element. */
  children: ReactElement;
  className?: string;
}

/**
 * Tooltip — shown on hover AND keyboard focus, linked to its trigger via
 * aria-describedby. Content is supplementary (never the only source of an
 * action's meaning). Positioned above the trigger; mirrors safely because it
 * is centred on the inline axis.
 */
export function Tooltip({ content, children, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-describedby": id,
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
        onFocus: () => setOpen(true),
        onBlur: () => setOpen(false),
      })
    : children;

  return (
    <span className="relative inline-flex">
      {trigger}
      <span
        role="tooltip"
        id={id}
        hidden={!open}
        className={cn(
          "pointer-events-none absolute bottom-full start-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap",
          "rounded-sm border border-border-default bg-surface-elevated px-2.5 py-1.5 text-caption text-text-primary shadow-e2",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
