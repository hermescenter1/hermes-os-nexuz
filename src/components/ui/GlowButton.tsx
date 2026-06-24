"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size    = "sm" | "md" | "lg";

const VARIANT_STYLES: Record<Variant, string> = {
  primary: [
    "bg-signal text-bg font-semibold",
    "hover:brightness-110",
    "shadow-[0_0_20px_rgba(var(--signal-rgb),0.30)]",
    "hover:shadow-[0_0_32px_rgba(var(--signal-rgb),0.50)]",
  ].join(" "),
  secondary: [
    "glass border border-signal/25 text-signal",
    "hover:border-signal/50 hover:bg-signal/[0.06]",
    "hover:shadow-[0_0_20px_rgba(var(--signal-rgb),0.14)]",
  ].join(" "),
  ghost: [
    "border border-line text-muted",
    "hover:border-line2 hover:text-ink hover:bg-surface2/60",
  ].join(" "),
  danger: [
    "glass border border-danger/30 text-danger",
    "hover:border-danger/50 hover:bg-danger/[0.06]",
    "hover:shadow-[0_0_20px_rgba(var(--danger-rgb),0.18)]",
  ].join(" "),
};

const SIZE_STYLES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-4 py-2   text-sm gap-2   rounded-xl",
  lg: "px-6 py-3   text-base gap-2.5 rounded-xl",
};

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  Variant;
  size?:     Size;
  icon?:     ReactNode;
  iconEnd?:  ReactNode;
  loading?:  boolean;
}

export function GlowButton({
  variant  = "secondary",
  size     = "md",
  icon,
  iconEnd,
  loading,
  children,
  className = "",
  disabled,
  ...props
}: GlowButtonProps) {
  const base = [
    "inline-flex items-center font-mono uppercase tracking-wider",
    "transition-all",
    "disabled:opacity-40 disabled:pointer-events-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50",
    SIZE_STYLES[size],
    VARIANT_STYLES[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={base}
      disabled={disabled || loading}
      style={{ transition: "all 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      {...props}
    >
      {loading ? (
        <span
          className="w-3.5 h-3.5 rounded-full border border-current border-t-transparent flex-shrink-0"
          style={{ animation: "spinRing 0.9s linear infinite" }}
        />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
      {!loading && iconEnd && <span className="flex-shrink-0">{iconEnd}</span>}
    </button>
  );
}
