import type { ReactNode } from "react";

interface SectionHeaderProps {
  eyebrow?:    string;
  title:       string;
  subtitle?:   string;
  actions?:    ReactNode;
  gradient?:   boolean;
  className?:  string;
  size?:       "sm" | "md" | "lg" | "xl";
  /** "mono" = technical label (font-mono), "label" = editorial label (font-body) */
  eyebrowStyle?: "mono" | "label";
}

const SIZE: Record<"sm" | "md" | "lg" | "xl", { title: string; sub: string }> = {
  sm: { title: "text-lg",                                        sub: "text-sm" },
  md: { title: "text-xl sm:text-2xl",                            sub: "text-sm" },
  lg: { title: "text-2xl sm:text-3xl",                           sub: "text-base" },
  xl: { title: "text-3xl sm:text-4xl",                           sub: "text-base" },
};

const WEIGHT: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "font-semibold",
  md: "font-bold",
  lg: "font-bold",
  xl: "font-extrabold",
};

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  gradient = false,
  className = "",
  size = "md",
  eyebrowStyle = "label",
}: SectionHeaderProps) {
  const s = SIZE[size];
  const w = WEIGHT[size];

  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div>
        {eyebrow && (
          eyebrowStyle === "mono" ? (
            <p className="eyebrow-mono mb-2">{eyebrow}</p>
          ) : (
            <p className="eyebrow-label mb-2">{eyebrow}</p>
          )
        )}
        <h2
          className={`font-display ${w} tracking-tight ${s.title} leading-tight ${
            gradient ? "text-gradient-signal" : "text-ink"
          }`}
        >
          {title}
        </h2>
        {subtitle && (
          <p className={`mt-2 ${s.sub} text-muted leading-relaxed`}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">{actions}</div>
      )}
    </div>
  );
}
