"use client";

import { forwardRef, type HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  glow?:     boolean;
  hover?:    boolean;
  neon?:     boolean;
  featured?: boolean;
  lift?:     boolean;
  deep?:     boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    { className = "", glow, hover, neon, featured, lift, deep, children, style, ...props },
    ref
  ) => {
    const classes = [
      "relative rounded-2xl border border-line",
      deep ? "glass-deep" : "glass",
      glow     ? "glow-signal"        : "",
      hover    ? "glass-hover"        : "",
      lift     ? "hover-lift cursor-pointer" : "",
      neon     ? "neon-border glow-signal-strong" : "",
      featured ? "neon-border glow-signal-strong ring-1 ring-signal/10" : "",
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
