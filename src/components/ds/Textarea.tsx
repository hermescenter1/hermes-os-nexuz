"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { FOCUS_RING } from "./a11y";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const BASE =
  "w-full min-h-24 rounded-sm bg-surface-interactive px-3 py-2 text-body text-text-primary " +
  "placeholder:text-text-muted border transition-colors duration-fast resize-y leading-relaxed " +
  FOCUS_RING +
  " disabled:opacity-40 disabled:cursor-not-allowed";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error = false, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(BASE, error ? "border-border-danger" : "border-border-default hover:border-border-active", className)}
      aria-invalid={error || undefined}
      {...props}
    />
  );
});
