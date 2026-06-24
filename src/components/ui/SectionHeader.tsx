import type { ReactNode } from "react";

interface SectionHeaderProps {
  eyebrow?:   string;
  title:      string;
  subtitle?:  string;
  actions?:   ReactNode;
  gradient?:  boolean;
  className?: string;
  size?:      "sm" | "md" | "lg";
}

const SIZE: Record<"sm" | "md" | "lg", { title: string; eyebrow: string }> = {
  sm: { title: "text-xl",   eyebrow: "text-[0.65rem]" },
  md: { title: "text-2xl",  eyebrow: "text-xs" },
  lg: { title: "text-3xl",  eyebrow: "text-sm" },
};

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  gradient = false,
  className = "",
  size = "md",
}: SectionHeaderProps) {
  const s = SIZE[size];

  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div>
        {eyebrow && (
          <p
            className={`${s.eyebrow} font-mono uppercase tracking-widest text-signal mb-1.5`}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className={`font-display font-bold ${s.title} ${
            gradient ? "text-gradient-signal" : "text-ink"
          }`}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-muted leading-relaxed">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 mt-1">{actions}</div>
      )}
    </div>
  );
}
