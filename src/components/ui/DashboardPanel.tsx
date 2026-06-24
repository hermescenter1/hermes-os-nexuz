import type { ReactNode } from "react";
import { GlassCard } from "./GlassCard";

type Accent = "signal" | "ice" | "warn" | "danger" | "steel" | "none";

const ACCENT_COLOR: Record<Accent, string> = {
  signal: "var(--signal)",
  ice:    "var(--ice)",
  warn:   "var(--warn)",
  danger: "var(--danger)",
  steel:  "var(--steel)",
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
  accent = "steel",
}: DashboardPanelProps) {
  const color = ACCENT_COLOR[accent];

  return (
    <GlassCard glow={glow} className={`overflow-hidden ${className}`}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-line/60">
        <div className="flex items-center gap-3 min-w-0">
          {/* Left accent marker — color-codes the panel by severity/type */}
          {accent !== "none" && (
            <div
              className="w-[3px] h-5 rounded-full flex-shrink-0"
              style={{ background: color, opacity: 0.55 }}
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="type-panel-title">{title}</h3>
              {badge && <div className="flex-shrink-0">{badge}</div>}
            </div>
            {subtitle && (
              <p className="type-caption mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 ms-3">{actions}</div>
        )}
      </div>

      {/* Panel body */}
      <div className="p-5 sm:p-6">{children}</div>
    </GlassCard>
  );
}
