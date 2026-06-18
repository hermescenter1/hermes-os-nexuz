import { GlassCard } from "./GlassCard";

type Accent = "signal" | "warn" | "danger" | "muted";
type Trend = "up" | "down" | "stable";

const ACCENT_CLASS: Record<Accent, string> = {
  signal: "text-signal",
  warn:   "text-[--warn]",
  danger: "text-[--danger]",
  muted:  "text-muted",
};

const TREND_ICON: Record<Trend, string> = { up: "↑", down: "↓", stable: "→" };
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
}

export function StatCard({
  label,
  value,
  subtitle,
  trend,
  accent = "signal",
  glow,
}: StatCardProps) {
  return (
    <GlassCard glow={glow} className="p-5 flex flex-col gap-2">
      <p className="text-xs font-mono uppercase tracking-widest text-muted">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <span className={`metric text-3xl font-bold ${ACCENT_CLASS[accent]}`}>
          {value}
        </span>
        {trend && (
          <span className={`text-sm font-semibold mb-0.5 ${TREND_CLASS[trend]}`}>
            {TREND_ICON[trend]}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-muted leading-snug">{subtitle}</p>
      )}
    </GlassCard>
  );
}
