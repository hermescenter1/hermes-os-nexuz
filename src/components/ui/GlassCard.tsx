"use client";

import { forwardRef, type HTMLAttributes } from "react";

// PHASE 87L.3 — compatibility wrapper over the approved 87L.1/87L.2 glass
// system. The public API is UNCHANGED (60+ direct consumers keep compiling and
// keep their layout, data, actions and semantics); only the surface treatment
// is remapped onto the `ds-glass-*` utilities so Hermes has ONE visual source
// of truth instead of two parallel glass systems.
//
// Legacy → approved mapping:
//   variant="standard"            → ds-glass-card      (filled glass default)
//   variant="standard" + deep     → ds-glass-elevated  (deeper well)
//   variant="enterprise"          → ds-glass-elevated  (heavier, more opaque)
//   variant="surface"             → ds-glass-soft      (quiet supporting)
//   hover / lift                  → ds-glass-interactive (approved hover tier)
//   featured                      → card-active        (semantic selected state)
//
// Deliberately dropped: `neon-border` + `glow-signal-strong`. The approved
// language has no neon rectangle, and 87L.3 §9 calls out "overly strong neon
// glow" as an inconsistency to correct — `neon` now resolves to the elevated
// tier's brighter ice border. `glow` keeps the restrained `glow-signal`.
//
// Because hover now routes through `ds-glass-interactive`, these consumers
// inherit the 87L.2 guarantees for free: fine-pointer gating (no sticky hover
// on touch), reduced-motion suppression, and the buoyancy hand-off. The legacy
// `.glass` / `.glass-hover` / `.hover-lift` classes are no longer emitted here,
// so the two hover systems can never stack on one element.

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
    // An explicitly hoverable/liftable card uses the interactive tier; the
    // depth tiers are otherwise chosen by variant. `deep` and `neon` both ask
    // for more presence, which the elevated tier provides without neon.
    const surface =
      hover || lift
        ? "ds-glass-interactive"
        : variant === "enterprise" || deep || neon
          ? "ds-glass-elevated"
          : variant === "surface"
            ? "ds-glass-soft"
            : "ds-glass-card";

    const classes = [
      "relative rounded-lg",
      surface,
      lift     ? "cursor-pointer" : "",
      glow     ? "glow-signal"    : "",
      featured ? "card-active"    : "",
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
