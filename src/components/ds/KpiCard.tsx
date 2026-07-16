import type { ReactNode } from "react";
import { cn } from "./cn";
import { Card } from "./Card";

export type KpiDelta = "up" | "down" | "flat";

const DELTA_COLOR: Record<KpiDelta, string> = {
  up: "text-status-success",
  down: "text-status-danger",
  flat: "text-text-muted",
};
// Arrows encode a mathematical sign, not reading direction → they must NOT
// mirror under RTL. They are literal glyphs, unaffected by layout direction.
const DELTA_GLYPH: Record<KpiDelta, string> = { up: "▲", down: "▼", flat: "—" };

export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Trend direction; colours and glyph the delta. */
  delta?: KpiDelta;
  deltaLabel?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * KpiCard — label + tabular value + optional delta. Values use tabular numerals
 * so columns stay aligned as live data changes.
 */
export function KpiCard({ label, value, delta, deltaLabel, icon, className }: KpiCardProps) {
  return (
    <Card className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-label-compact font-semibold uppercase tracking-wide text-text-muted">{label}</span>
        {icon ? <span className="text-text-muted">{icon}</span> : null}
      </div>
      <span className="ds-tabular text-kpi-md font-bold text-text-primary">{value}</span>
      {delta && deltaLabel ? (
        <span className={cn("ds-tabular inline-flex items-center gap-1 text-caption font-medium", DELTA_COLOR[delta])}>
          <span aria-hidden="true">{DELTA_GLYPH[delta]}</span>
          {deltaLabel}
        </span>
      ) : null}
    </Card>
  );
}
