"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn";
import { FOCUS_RING } from "./a11y";

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Checkbox — a real <input type="checkbox"> tinted with the brand accent.
 * Native semantics keep keyboard + screen-reader behaviour correct for free.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded-xs accent-brand-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
        FOCUS_RING,
        className,
      )}
      {...props}
    />
  );
});
