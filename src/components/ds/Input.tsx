"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn";
import { FOCUS_RING } from "./a11y";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders the error treatment and sets aria-invalid. */
  error?: boolean;
}

const BASE =
  "w-full h-9 rounded-sm bg-surface-interactive px-3 text-body text-text-primary " +
  "placeholder:text-text-muted border transition-colors duration-fast " +
  FOCUS_RING +
  " disabled:opacity-40 disabled:cursor-not-allowed";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error = false, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(BASE, error ? "border-border-danger" : "border-border-default hover:border-border-active", className)}
      aria-invalid={error || undefined}
      {...props}
    />
  );
});
