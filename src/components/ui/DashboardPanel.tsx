import type { ReactNode } from "react";
import { GlassCard } from "./GlassCard";

interface DashboardPanelProps {
  title:     string;
  subtitle?: string;
  actions?:  ReactNode;
  children:  ReactNode;
  className?: string;
  glow?:     boolean;
}

export function DashboardPanel({
  title,
  subtitle,
  actions,
  children,
  className = "",
  glow,
}: DashboardPanelProps) {
  return (
    <GlassCard glow={glow} className={className}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-line">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-6">{children}</div>
    </GlassCard>
  );
}
