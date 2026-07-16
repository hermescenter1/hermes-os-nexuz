"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn";
import { FOCUS_RING } from "./a11y";

export type RadioProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Radio — a real <input type="radio"> tinted with the brand accent. Group
 * behaviour comes from a shared `name`; native semantics do the rest.
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="radio"
      className={cn(
        "h-4 w-4 accent-brand-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
        FOCUS_RING,
        className,
      )}
      {...props}
    />
  );
});
