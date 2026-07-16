"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";
import { FOCUS_RING } from "./a11y";
import { Spinner } from "./Spinner";
import type { ButtonVariant } from "./Button";

export type IconButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center shrink-0 rounded-sm " +
  "transition-colors duration-standard ease-hermes " +
  FOCUS_RING +
  " disabled:opacity-40 disabled:pointer-events-none";

const VARIANTS: Record<Extract<ButtonVariant, "primary" | "secondary" | "tertiary">, string> = {
  primary: "bg-brand-primary text-brand-on-brand hover:bg-brand-primary-hover active:bg-brand-primary-pressed",
  secondary:
    "bg-transparent text-text-secondary border border-border-default " +
    "hover:border-border-active hover:text-text-primary hover:bg-surface-interactive",
  tertiary: "bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-interactive",
};

// Sizes chosen so `md`/`lg` reach the 44px touch target on the interactive area.
const SIZES: Record<IconButtonSize, string> = {
  sm: "h-8 w-8 text-base",
  md: "h-9 w-9 text-lg",
  lg: "h-11 w-11 text-xl",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon buttons have no visible text. */
  "aria-label": string;
  variant?: keyof typeof VARIANTS;
  size?: IconButtonSize;
  loading?: boolean;
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "secondary", size = "md", loading = false, icon, className, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={size === "lg" ? 18 : 14} /> : <span className="shrink-0">{icon}</span>}
    </button>
  );
});
