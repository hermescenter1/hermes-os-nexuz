/**
 * PHASE 93 — Control-Room presentational parts (server components).
 *
 * Pure, JSX presentation only: every part receives already-collected real data
 * and already-translated strings from the page. No I/O, no client JS, no
 * fabricated values. Bars render only what they are given; an empty series is a
 * professional empty-state, never a zero-filled placeholder.
 */

import type { ReactNode } from "react";
import { cn } from "@/components/ds/cn";
import { cardVariants } from "@/components/ds/logic";
import type { SeriesPoint, Tone } from "./logic";
import { barPercent, seriesMax } from "./logic";

/* ── tone → utility classes (Tailwind maps to the --color-status-* tokens) ── */

const TONE_DOT: Record<Tone, string> = {
  success: "bg-status-success",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
  information: "bg-status-information",
  neutral: "bg-text-muted",
};
const TONE_BAR: Record<Tone, string> = {
  success: "bg-status-success",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
  information: "bg-status-information",
  neutral: "bg-brand-primary",
};
const TONE_TEXT: Record<Tone, string> = {
  success: "text-status-success",
  warning: "text-status-warning",
  danger: "text-status-danger",
  information: "text-status-information",
  neutral: "text-text-secondary",
};
const TONE_RING: Record<Tone, string> = {
  success: "border-status-success-border",
  warning: "border-status-warning-border",
  danger: "border-status-danger-border",
  information: "border-status-information-border",
  neutral: "border-border-default",
};

export function StatusDot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return <span aria-hidden="true" className={cn("inline-block h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone], pulse && "ds-pulse")} />;
}

/* ── Panel: the standard glass card with a titled header + data provenance ── */

export function Panel({
  id,
  title,
  tone,
  statusLabel,
  source,
  observedAt,
  actions,
  children,
  className,
}: {
  id: string;
  title: string;
  tone?: Tone;
  statusLabel?: string;
  source?: string;
  observedAt?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={cn(cardVariants("standard", { padded: false }), "flex flex-col", className)}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border-subtle px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          {tone ? <StatusDot tone={tone} pulse={tone === "danger"} /> : null}
          <h2 id={`${id}-title`} className="text-body font-semibold text-text-primary">{title}</h2>
          {statusLabel && tone ? (
            <span className={cn("text-label-compact font-semibold uppercase tracking-wide", TONE_TEXT[tone])}>{statusLabel}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {actions}
          {(source || observedAt) ? (
            <span className="ds-tabular text-label-compact text-text-muted">
              {source ? <span>{source}</span> : null}
              {source && observedAt ? <span aria-hidden="true"> · </span> : null}
              {observedAt ? <time dateTime={observedAt}>{observedAt}</time> : null}
            </span>
          ) : null}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** A compact provenance line for use inside panels. */
export function MetaLine({ source, observedAt }: { source: string; observedAt: string }) {
  return (
    <p className="ds-tabular mt-3 text-label-compact text-text-muted">
      <span>{source}</span> <span aria-hidden="true">·</span> <time dateTime={observedAt}>{observedAt}</time>
    </p>
  );
}

/* ── BarSeries: a real horizontal bar chart from SeriesPoint[] ── */

export function BarSeries({
  items,
  emptyLabel,
  ariaLabel,
  formatValue,
  max,
}: {
  items: SeriesPoint[];
  emptyLabel: string;
  ariaLabel: string;
  formatValue?: (v: number) => string;
  max?: number;
}) {
  if (items.length === 0) {
    return <p className="text-caption text-text-muted">{emptyLabel}</p>;
  }
  const scale = max ?? seriesMax(items);
  const fmt = formatValue ?? ((v: number) => String(v));
  return (
    <ul className="flex flex-col gap-2.5" role="img" aria-label={ariaLabel}>
      {items.map((p) => {
        const tone: Tone = p.tone ?? "neutral";
        return (
          <li key={p.label} className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3">
            <span className="truncate text-caption text-text-secondary" title={p.label}>{p.label}</span>
            <span aria-hidden="true" className="h-2 rounded-full bg-surface-interactive">
              <span className={cn("block h-2 rounded-full", TONE_BAR[tone])} style={{ inlineSize: `${barPercent(p.value, scale)}%` }} />
            </span>
            <span className={cn("ds-tabular text-caption font-semibold tabular-nums", TONE_TEXT[tone])}>{fmt(p.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── DependencyCard: one node of the topology (live probe) ── */

export function DependencyCard({
  name,
  tone,
  statusLabel,
  detailLabel,
  latencyLabel,
  observedLabel,
  source,
}: {
  name: string;
  tone: Tone;
  statusLabel: string;
  detailLabel: string;
  latencyLabel: string | null;
  observedLabel: string;
  source: string;
}) {
  return (
    <div className={cn(cardVariants("soft", { padded: true }), "flex flex-col gap-2 border", TONE_RING[tone])}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-body font-semibold text-text-primary">{name}</span>
        <span className="flex items-center gap-1.5">
          <StatusDot tone={tone} pulse={tone === "danger"} />
          <span className={cn("text-label-compact font-semibold uppercase tracking-wide", TONE_TEXT[tone])}>{statusLabel}</span>
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-caption text-text-muted">{detailLabel}</span>
        {latencyLabel ? <span className="ds-tabular text-body font-semibold text-text-secondary tabular-nums">{latencyLabel}</span> : null}
      </div>
      <p className="ds-tabular text-label-compact text-text-muted">
        {source} <span aria-hidden="true">·</span> {observedLabel}
      </p>
    </div>
  );
}

/* ── NotInstrumentedPanel: honest, premium "no data source configured" ── */

export function NotInstrumentedPanel({
  title,
  statusLabel,
  explanation,
  sourceLabel,
  sourceValue,
  actionLabel,
}: {
  title: string;
  statusLabel: string;
  explanation: string;
  sourceLabel: string;
  sourceValue: string;
  actionLabel: string;
}) {
  return (
    <div className={cn(cardVariants("technical", { padded: true }), "flex flex-col gap-3")}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body font-semibold text-text-secondary">{title}</span>
        <span className="inline-flex items-center gap-1.5 rounded-xs border border-border-default bg-surface-interactive px-2 py-0.5">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full border border-dashed border-text-muted" />
          <span className="text-label-compact font-semibold uppercase tracking-wide text-text-muted">{statusLabel}</span>
        </span>
      </div>
      {/* A muted, dashed, deliberately data-LESS track — signals "not measured", not "zero". */}
      <div aria-hidden="true" className="flex h-16 items-center justify-center rounded-md border border-dashed border-border-default bg-background-deep">
        <span className="text-label-compact uppercase tracking-widest text-text-disabled">— — —</span>
      </div>
      <p className="text-caption text-text-muted">{explanation}</p>
      <dl className="ds-tabular grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-label-compact">
        <dt className="text-text-muted">{sourceLabel}</dt>
        <dd className="text-text-secondary">{sourceValue}</dd>
      </dl>
      <p className="text-label-compact text-brand-primary">{actionLabel}</p>
    </div>
  );
}

/* ── StatTile: label + value + optional sub (no delta — we never fake a trend) ── */

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className={cn(cardVariants("soft", { padded: true }), "flex flex-col gap-1")}>
      <span className="text-label-compact font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      <span className={cn("ds-tabular text-kpi-md font-bold tabular-nums", TONE_TEXT[tone])}>{value}</span>
      {sub ? <span className="ds-tabular text-label-compact text-text-muted">{sub}</span> : null}
    </div>
  );
}

/* ── PostureBanner: the overall real-signal-derived posture ── */

export function PostureBanner({
  tone,
  headline,
  detail,
}: {
  tone: Tone;
  headline: string;
  detail: string;
}) {
  return (
    <div className={cn(cardVariants("hero", { padded: true }), "flex items-center gap-4 border", TONE_RING[tone])}>
      <StatusDot tone={tone} pulse={tone === "danger" || tone === "warning"} />
      <div className="min-w-0">
        <p className={cn("text-title font-bold", TONE_TEXT[tone])}>{headline}</p>
        <p className="text-caption text-text-secondary">{detail}</p>
      </div>
    </div>
  );
}
