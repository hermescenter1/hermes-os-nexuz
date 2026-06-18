"use client";

import { forwardRef, type HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  hover?: boolean;
  neon?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className = "", glow, hover, neon, children, ...props }, ref) => {
    const classes = [
      "relative rounded-2xl border border-line glass",
      glow ? "glow-signal" : "",
      hover ? "glass-hover transition-all duration-300 cursor-pointer" : "",
      neon ? "neon-border glow-signal-strong" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div ref={ref} className={classes} {...props}>
        {children}
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";
