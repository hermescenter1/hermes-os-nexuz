import type { ReactNode } from "react";
import { GlassCard } from "./GlassCard";

interface DashboardPanelProps {
  title:      string;
  subtitle?:  string;
  actions?:   ReactNode;
  children:   ReactNode;
  className?: string;
  glow?:      boolean;
  badge?:     ReactNode;
}

export function DashboardPanel({
  title,
  subtitle,
  actions,
  children,
  className = "",
  glow,
  badge,
}: DashboardPanelProps) {
  return (
    <GlassCard glow={glow} className={className}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
        <div className="flex items-center gap-2.5 min-w-0">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[0.8rem] font-semibold text-ink truncate">{title}</h3>
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
