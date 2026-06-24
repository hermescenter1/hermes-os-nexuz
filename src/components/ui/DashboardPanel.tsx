import type { ReactNode } from "react";
import { GlassCard } from "./GlassCard";

type Accent = "signal" | "ice" | "warn" | "danger" | "none";

const ACCENT_COLOR: Record<Accent, string> = {
  signal: "var(--signal)",
  ice:    "var(--ice)",
  warn:   "var(--warn)",
  danger: "var(--danger)",
  none:   "transparent",
};

interface DashboardPanelProps {
  title:      string;
  subtitle?:  string;
  actions?:   ReactNode;
  children:   ReactNode;
  className?: string;
  glow?:      boolean;
  badge?:     ReactNode;
  accent?:    Accent;
}

export function DashboardPanel({
  title,
  subtitle,
  actions,
  children,
  className = "",
  glow,
  badge,
  accent = "signal",
}: DashboardPanelProps) {
  const color = ACCENT_COLOR[accent];

  return (
    <GlassCard glow={glow} className={`overflow-hidden ${className}`}>
      {/* Top gradient accent line */}
      <div
        className="absolute top-0 inset-x-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${color}50 30%, ${color}80 50%, ${color}50 70%, transparent 100%)`,
        }}
      />

      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Accent dot */}
          {accent !== "none" && (
            <div
              className="w-1 h-4 rounded-full flex-shrink-0"
              style={{
                background: `linear-gradient(180deg, ${color} 0%, transparent 100%)`,
                boxShadow: `0 0 8px ${color}60`,
              }}
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[0.82rem] font-semibold text-ink truncate">{title}</h3>
              {badge && <div className="flex-shrink-0">{badge}</div>}
            </div>
            {subtitle && (
              <p className="text-[0.7rem] text-muted mt-0.5 leading-tight">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 ms-3">{actions}</div>
        )}
      </div>

      {/* Panel body */}
      <div className="p-5">{children}</div>
    </GlassCard>
  );
}
