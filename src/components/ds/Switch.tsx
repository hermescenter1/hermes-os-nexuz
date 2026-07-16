"use client";

import { cn } from "./cn";
import { FOCUS_RING } from "./a11y";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * Switch — an accessible on/off toggle (`role="switch"`, `aria-checked`).
 * The thumb sits on the inline-start when off and inline-end when on; because
 * it is laid out with justify-* (inline axis), it mirrors correctly under RTL
 * with no extra logic. Provide `aria-label` or `aria-labelledby`.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  className,
  ...aria
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors duration-fast",
        checked ? "justify-end bg-brand-primary" : "justify-start bg-surface-interactive border border-border-default",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        FOCUS_RING,
        className,
      )}
      {...aria}
    >
      <span
        aria-hidden="true"
        className={cn("h-5 w-5 rounded-full transition-colors", checked ? "bg-brand-on-brand" : "bg-text-muted")}
      />
    </button>
  );
}
