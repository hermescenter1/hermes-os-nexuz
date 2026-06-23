"use client";

import { forwardRef, type HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  glow?:      boolean;
  hover?:     boolean;
  neon?:      boolean;
  /** Stronger glow + neon border used for featured/primary cards */
  featured?:  boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className = "", glow, hover, neon, featured, children, style, ...props }, ref) => {
    const classes = [
      "relative rounded-2xl border border-line glass",
      glow      ? "glow-signal"                                       : "",
      hover     ? "glass-hover transition-all duration-300 cursor-pointer" : "",
      neon      ? "neon-border glow-signal-strong"                    : "",
      featured  ? "neon-border glow-signal-strong ring-1 ring-signal/10" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        ref={ref}
        className={classes}
        style={{
          transition: hover ? "box-shadow 0.3s ease, border-color 0.3s ease, background 0.3s ease" : undefined,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";
