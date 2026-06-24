import type { ReactNode } from "react";

export interface KpiItem {
  label:   string;
  value:   string | number;
  unit?:   string;
  trend?:  "up" | "down" | "stable";
  delta?:  string;
  accent?: "signal" | "warn" | "danger" | "neutral";
  note?:   string;
}

const ACCENT_VALUE: Record<string, string> = {
  signal:  "text-signal",
  warn:    "text-warn",
  danger:  "text-danger",
  neutral: "text-ink",
};
const TREND_ICON  = { up: "↑", down: "↓", stable: "→" } as const;
const TREND_CLASS = { up: "text-signal", down: "text-danger", stable: "text-muted" } as const;

interface ExecKpiStripProps {
  items:       KpiItem[];
  className?:  string;
  children?:   ReactNode;
}

export function ExecKpiStrip({ items, className = "", children }: ExecKpiStripProps) {
  return (
    <div
      className={`flex items-stretch divide-x divide-line border border-line rounded-xl overflow-x-auto mb-6 ${className}`}
      style={{ background: "var(--surface)" }}
      role="region"
      aria-label="Key performance indicators"
    >
      {items.map((item, i) => (
        <div key={i} className="flex-1 min-w-[110px] px-5 py-4">
          <p className="type-eyebrow mb-1.5">{item.label}</p>
          <div className="flex items-baseline gap-1 flex-wrap">
            <span
              className={`metric text-2xl leading-none ${
                item.accent ? (ACCENT_VALUE[item.accent] ?? "text-ink") : "text-ink"
              }`}
            >
              {item.value}
            </span>
            {item.unit && (
              <span className="text-xs text-muted font-body">{item.unit}</span>
            )}
          </div>
          {item.delta && item.trend && (
            <p className={`mt-1 text-xs font-body ${TREND_CLASS[item.trend]}`}>
              {TREND_ICON[item.trend]} {item.delta}
            </p>
          )}
          {item.note && !item.delta && (
            <p className="mt-1 text-xs font-body text-muted">{item.note}</p>
          )}
        </div>
      ))}
      {children}
    </div>
  );
}

/** Single compact KPI item for use inside ExecKpiStrip as a children slot */
export function KpiSlot({
  label,
  value,
  unit,
  accent,
}: Pick<KpiItem, "label" | "value" | "unit" | "accent">) {
  return (
    <div className="flex-1 min-w-[110px] px-5 py-4 border-l border-line">
      <p className="type-eyebrow mb-1.5">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={`metric text-2xl leading-none ${accent ? (ACCENT_VALUE[accent] ?? "text-ink") : "text-ink"}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-muted font-body">{unit}</span>}
      </div>
    </div>
  );
}
