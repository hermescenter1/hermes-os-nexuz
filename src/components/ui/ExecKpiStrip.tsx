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
      /* PHASE 104 R1 (V-M4) - the strip was `overflow-x-auto` with five 10rem
         cells. Five cells need 800px; the dashboard content column is ~712px
         at the 1024 desktop class, so the fifth metric (POWER DRAW) was cut
         mid-value at a REQUIRED viewport, with only a scrollbar to say so.
         It now wraps, which is what `.global-ops-strip` two sections below
         has done since 89C: cells keep their measured floor and drop to a
         second row instead of being clipped. `divide-x` is replaced by a
         LOGICAL per-cell border so the dividers stay correct under RTL and
         survive wrapping. */
      className={`flex flex-wrap items-stretch border border-line rounded-xl overflow-hidden mb-6 ${className}`}
      style={{ background: "var(--surface)" }}
      role="region"
      aria-label="Key performance indicators"
    >
      {items.map((item, i) => (
        // PHASE 104-H — the cell floor must cover the LONGEST LABEL WORD any
        // locale ships, or the label overflows the cell (overflow:visible), and
        // that overflow escapes the strip's own horizontal scroller and widens
        // the DOCUMENT — the residual 16px of the known "German Dashboard 320
        // overflow". Measured at the label's computed font: PRODUKTIONSLINIEN =
        // 113px + 40px cell padding = 153px → 10rem. en (106px) / fa fit inside
        // it. The strip still scrolls horizontally as before; only the per-cell
        // floor changed. Font size and copy untouched.
        <div key={i} className="flex-1 min-w-[10rem] border-s border-line px-5 py-4 first:border-s-0">
          <p className="kpi-label mb-2">{item.label}</p>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span
              className={`exec-kpi-value ${
                item.accent ? (ACCENT_VALUE[item.accent] ?? "text-ink") : "text-ink"
              }`}
            >
              {item.value}
            </span>
            {item.unit && (
              <span className="font-mono text-xs text-muted">{item.unit}</span>
            )}
          </div>
          {item.delta && item.trend && (
            <p className={`mt-1.5 kpi-label ${TREND_CLASS[item.trend]}`}>
              {TREND_ICON[item.trend]} {item.delta}
            </p>
          )}
          {item.note && !item.delta && (
            <p className="mt-1.5 kpi-label text-metadata">{item.note}</p>
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
    // PHASE 104-H — same measured 10rem cell floor as the strip's own cells (see
    // above), and the divider is `border-s` (logical), not `border-l`: a physical
    // left border sat on the WRONG side of the slot under RTL. Behaviour unchanged.
    <div className="flex-1 min-w-[10rem] px-5 py-4 border-s border-line">
      <p className="kpi-label mb-2">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`exec-kpi-value ${accent ? (ACCENT_VALUE[accent] ?? "text-ink") : "text-ink"}`}>
          {value}
        </span>
        {unit && <span className="font-mono text-xs text-muted">{unit}</span>}
      </div>
    </div>
  );
}
