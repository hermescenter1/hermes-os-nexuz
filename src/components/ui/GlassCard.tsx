"use client";

import { forwardRef, type HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  glow?:       boolean;
  hover?:      boolean;
  neon?:       boolean;
  featured?:   boolean;
  lift?:       boolean;
  deep?:       boolean;
  /** "standard" = glass panel · "enterprise" = heavier depth, more opaque */
  variant?:    "standard" | "enterprise" | "surface";
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      className = "",
      glow,
      hover,
      neon,
      featured,
      lift,
      deep,
      variant = "standard",
      children,
      style,
      ...props
    },
    ref
  ) => {
    const base =
      variant === "enterprise"
        ? "relative rounded-2xl card-enterprise"
        : variant === "surface"
          ? "relative rounded-xl card-surface"
          : `relative rounded-2xl border border-line ${deep ? "glass-deep" : "glass"}`;

    const classes = [
      base,
      glow     ? "glow-signal"                  : "",
      hover    ? "glass-hover"                  : "",
      lift     ? "hover-lift cursor-pointer"    : "",
      neon     ? "neon-border glow-signal-strong" : "",
      featured ? "card-active"                  : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div ref={ref} className={classes} style={style} {...props}>
        {children}
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";
