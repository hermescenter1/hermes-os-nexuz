import type { ReactNode } from "react";
import { GlassCard } from "./GlassCard";

type Accent = "signal" | "warn" | "danger" | "muted" | "ice";
type Trend  = "up" | "down" | "stable";

const ACCENT: Record<Accent, {
  text:    string;
  bg:      string;
  border:  string;
  stripe:  string;
  glow:    string;
}> = {
  signal: {
    text:   "text-signal",
    bg:     "bg-signal/[0.07]",
    border: "border-signalDim/40",
    stripe: "var(--signal)",
    glow:   "rgba(var(--signal-rgb), 0.20)",
  },
  ice: {
    text:   "text-ice",
    bg:     "bg-ice/[0.07]",
    border: "border-iceDim/40",
    stripe: "var(--ice)",
    glow:   "rgba(var(--ice-rgb), 0.20)",
  },
  warn: {
    text:   "text-warn",
    bg:     "bg-warn/[0.07]",
    border: "border-warn/30",
    stripe: "var(--warn)",
    glow:   "rgba(var(--warn-rgb), 0.20)",
  },
  danger: {
    text:   "text-danger",
    bg:     "bg-danger/[0.07]",
    border: "border-danger/30",
    stripe: "var(--danger)",
    glow:   "rgba(var(--danger-rgb), 0.20)",
  },
  muted: {
    text:   "text-muted",
    bg:     "bg-muted/[0.05]",
    border: "border-line",
    stripe: "var(--muted)",
    glow:   "rgba(138, 160, 180, 0.15)",
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
    <GlassCard glow={glow} hover={hover} className="p-5 flex flex-col gap-3 overflow-hidden">
      {/* Top accent stripe */}
      <div
        className="absolute top-0 inset-x-0 h-px rounded-t-2xl"
        style={{
          background: `linear-gradient(90deg, transparent, ${a.stripe}40, transparent)`,
        }}
      />

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
        <span className={`metric text-3xl font-bold ${a.text}`}
          style={{ textShadow: `0 0 24px ${a.glow}` }}>
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
        <p className="text-xs text-muted leading-snug">{subtitle}</p>
      )}
    </GlassCard>
  );
}
