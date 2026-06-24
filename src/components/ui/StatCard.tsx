import type { ReactNode } from "react";
import { GlassCard } from "./GlassCard";

type Accent = "signal" | "warn" | "danger" | "muted" | "ice" | "steel";
type Trend  = "up" | "down" | "stable";

const ACCENT: Record<Accent, {
  text:   string;
  bg:     string;
  border: string;
  stripe: string;
  glow:   string;
}> = {
  signal: {
    text:   "text-signal",
    bg:     "bg-signal/[0.06]",
    border: "border-signalDim/40",
    stripe: "var(--signal)",
    glow:   "rgba(var(--signal-rgb), 0.18)",
  },
  ice: {
    text:   "text-ice",
    bg:     "bg-ice/[0.06]",
    border: "border-iceDim/40",
    stripe: "var(--ice)",
    glow:   "rgba(var(--ice-rgb), 0.18)",
  },
  steel: {
    text:   "text-steel",
    bg:     "bg-steelDim/60",
    border: "border-line2",
    stripe: "var(--steel)",
    glow:   "rgba(var(--steel-rgb), 0.15)",
  },
  warn: {
    text:   "text-warn",
    bg:     "bg-warn/[0.06]",
    border: "border-warn/30",
    stripe: "var(--warn)",
    glow:   "rgba(var(--warn-rgb), 0.18)",
  },
  danger: {
    text:   "text-danger",
    bg:     "bg-danger/[0.06]",
    border: "border-danger/30",
    stripe: "var(--danger)",
    glow:   "rgba(var(--danger-rgb), 0.18)",
  },
  muted: {
    text:   "text-muted",
    bg:     "bg-muted/[0.05]",
    border: "border-line",
    stripe: "var(--muted)",
    glow:   "rgba(148, 163, 184, 0.12)",
  },
};

const TREND_ICON:  Record<Trend, string> = { up: "↑", down: "↓", stable: "→" };
const TREND_CLASS: Record<Trend, string> = {
  up:     "text-signal",
  down:   "text-danger",
  stable: "text-muted",
};

interface StatCardProps {
  label:     string;
  value:     string | number;
  subtitle?: string;
  trend?:    Trend;
  accent?:   Accent;
  glow?:     boolean;
  hover?:    boolean;
  icon?:     ReactNode;
}

export function StatCard({
  label,
  value,
  subtitle,
  trend,
  accent = "signal",
  glow,
  hover = true,
  icon,
}: StatCardProps) {
  const a = ACCENT[accent];

  return (
    <GlassCard glow={glow} hover={hover} className="p-6 flex flex-col gap-3 overflow-hidden">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <p className="type-eyebrow">{label}</p>
        {icon && (
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0 ${a.bg} ${a.border}`}
          >
            <span className={`text-sm leading-none ${a.text}`}>{icon}</span>
          </div>
        )}
      </div>

      {/* Value + trend */}
      <div className="flex items-end justify-between gap-2">
        <span className={`metric text-3xl font-bold ${a.text}`}>
          {value}
        </span>
        {trend && (
          <span className={`text-sm font-semibold mb-0.5 ${TREND_CLASS[trend]}`}>
            {TREND_ICON[trend]}
          </span>
        )}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="type-caption -mt-1">{subtitle}</p>
      )}
    </GlassCard>
  );
}
