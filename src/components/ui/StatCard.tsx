import type { ReactNode } from "react";
import { GlassCard } from "./GlassCard";

type Accent = "signal" | "warn" | "danger" | "muted";
type Trend  = "up" | "down" | "stable";

const ACCENT: Record<Accent, { text: string; bg: string; border: string }> = {
  signal: { text: "text-signal",       bg: "bg-signal/[0.08]",       border: "border-signalDim/40" },
  warn:   { text: "text-[--warn]",     bg: "bg-[--warn]/[0.08]",     border: "border-[--warn]/30"  },
  danger: { text: "text-[--danger]",   bg: "bg-[--danger]/[0.08]",   border: "border-[--danger]/30"},
  muted:  { text: "text-muted",        bg: "bg-muted/[0.06]",        border: "border-line"          },
};

const TREND_ICON:  Record<Trend, string> = { up: "↑", down: "↓", stable: "→" };
const TREND_CLASS: Record<Trend, string> = {
  up:     "text-signal",
  down:   "text-[--danger]",
  stable: "text-muted",
};

interface StatCardProps {
  label:     string;
  value:     string | number;
  subtitle?: string;
  trend?:    Trend;
  accent?:   Accent;
  glow?:     boolean;
  icon?:     ReactNode;
}

export function StatCard({
  label,
  value,
  subtitle,
  trend,
  accent = "signal",
  glow,
  icon,
}: StatCardProps) {
  const a = ACCENT[accent];
  return (
    <GlassCard glow={glow} hover className="p-5 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-mono uppercase tracking-widest text-muted">
          {label}
        </p>
        {icon && (
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center border ${a.bg} ${a.border}`}
          >
            <span className={`text-sm leading-none ${a.text}`}>{icon}</span>
          </div>
        )}
      </div>

      {/* Value + trend */}
      <div className="flex items-end justify-between gap-2">
        <span className={`metric text-3xl font-bold ${a.text}`}>{value}</span>
        {trend && (
          <span className={`text-sm font-semibold mb-0.5 ${TREND_CLASS[trend]}`}>
            {TREND_ICON[trend]}
          </span>
        )}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-xs text-muted leading-snug">{subtitle}</p>
      )}
    </GlassCard>
  );
}
