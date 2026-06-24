"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { telemetryService } from "@/lib/services/telemetry-service";
import { ExecutiveOverview } from "./ExecutiveOverview";
import type {
  DashboardSnapshot,
  MetricSeries,
  Severity,
} from "@/lib/services/types";

const POLL_MS = 5_000;

/* ---------- shared bits ---------- */

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface p-6 ${className}`}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
    >
      <h2 className="type-panel-title mb-4">{title}</h2>
      {children}
    </section>
  );
}

const statusColor: Record<string, string> = {
  running: "text-signal",
  online: "text-signal",
  ok: "text-signal",
  idle: "text-muted",
  flat: "text-muted",
  warning: "text-[var(--warn)]",
  degraded: "text-[var(--warn)]",
  up: "text-[var(--danger)]",
  fault: "text-[var(--danger)]",
  offline: "text-[var(--danger)]",
  down: "text-signal",
};

const sevColor: Record<Severity, string> = {
  critical: "bg-[var(--danger)]",
  high: "bg-[var(--danger)]/80",
  medium: "bg-[var(--warn)]",
  low: "bg-muted/60",
};

function Dot({ tone }: { tone: string }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${
        tone.includes("signal")
          ? "bg-signal"
          : tone.includes("warn")
            ? "bg-[var(--warn)]"
            : tone.includes("danger")
              ? "bg-[var(--danger)]"
              : "bg-muted"
      }`}
      aria-hidden="true"
    />
  );
}

function Spark({ data, warn = false }: { data: number[]; warn?: boolean }) {
  const w = 96;
  const h = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`
    )
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      style={{ direction: "ltr" }} // time axis always flows left->right
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={warn ? "var(--warn)" : "var(--signal)"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MetricRows({ list, nf }: { list: MetricSeries[]; nf: Intl.NumberFormat }) {
  const t = useTranslations("dashboard.metrics");
  return (
    <ul className="space-y-3">
      {list.map((m) => (
        <li key={m.tag} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs text-muted" dir="ltr">
                {m.tag}
              </span>
              <span className="metric text-lg text-ink">
                {nf.format(m.value)}
                <span className="ms-1 font-body text-xs font-normal text-muted" dir="ltr">
                  {m.unit}
                </span>
              </span>
            </div>
            <p className="mt-0.5 font-body text-[0.7rem] text-muted/80">
              {t("min")} {nf.format(m.min)} · {t("max")} {nf.format(m.max)}
            </p>
          </div>
          <Spark data={m.history} />
        </li>
      ))}
    </ul>
  );
}

/* ---------- dashboard ---------- */

export function DashboardClient() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    async function tick() {
      const r = await telemetryService.snapshot();
      if (!live) return;
      if (r.ok) {
        setSnap(r.data);
        setError(null);
      } else setError(r.error);
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const tf = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const pct = locale === "fa" ? "\u066A" : "%"; // ٪ for fa, % otherwise

  if (error)
    return (
      <div className="mx-auto max-w-7xl px-6 sm:px-8 py-12">
        <p className="rounded-xl border border-danger/30 bg-surface px-5 py-4 font-mono text-sm text-danger">
          {error}
        </p>
      </div>
    );

  if (!snap)
    return (
      <div className="mx-auto max-w-7xl px-6 py-16">
        <p className="animate-pulse font-mono text-sm text-muted">···</p>
      </div>
    );

  const s = snap;
  const totalAlarms =
    s.alarms.counts.critical +
    s.alarms.counts.high +
    s.alarms.counts.medium +
    s.alarms.counts.low;

  return (
    <div className="mx-auto max-w-7xl px-6 sm:px-8 pb-20 pt-6">
      <ExecutiveOverview />

      <p className="mb-5 font-mono text-[0.7rem] text-faint">
        {t("updated")} {tf.format(s.ts)}
      </p>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {/* 1 — Factory Overview */}
        <Panel title={t("panels.overview")} className="md:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(
              [
                ["oee", s.overview.oee],
                ["availability", s.overview.availability],
                ["performance", s.overview.performance],
                ["quality", s.overview.quality],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <p className="font-body text-xs text-muted">{t(`overview.${k}`)}</p>
                <p className="metric mt-1 text-2xl text-ink">
                  {nf.format(v)}
                  <span className="text-sm text-muted">{pct}</span>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 font-body text-xs text-muted">
            {t("overview.activeLines")}:{" "}
            <span className="font-mono text-ink">
              {nf.format(s.overview.activeLines)}/{nf.format(s.overview.totalLines)}
            </span>
          </p>
        </Panel>

        {/* 13 — System Risk Score */}
        <Panel title={t("panels.risk")} className="md:col-span-2 xl:col-span-2">
          <div className="flex items-start gap-6">
            <div>
              <p className="metric text-5xl text-ink">{nf.format(s.risk.score)}</p>
              <p className={`mt-1 font-body text-xs ${statusColor[s.risk.trend]}`}>
                {t(`riskP.trend.${s.risk.trend}`)}
              </p>
            </div>
            <ul className="flex-1 space-y-2">
              {s.risk.factors.map((f) => (
                <li key={f.key}>
                  <div className="flex justify-between font-body text-xs text-muted">
                    <span>{t(`riskP.factors.${f.key}`)}</span>
                    <span className="font-mono">{nf.format(Math.round(f.weight * 100))}{pct}</span>
                  </div>
                  <div className="mt-1 h-1 rounded bg-line">
                    <div
                      className="h-1 rounded bg-signal"
                      style={{ inlineSize: `${Math.min(f.weight * 100, 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        {/* 2 — Production Lines */}
        <Panel title={t("panels.lines")}>
          <ul className="space-y-3">
            {s.lines.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted" dir="ltr">{l.id}</span>
                <span className={`font-body text-xs ${statusColor[l.status]}`}>
                  <Dot tone={statusColor[l.status]} /> {t(`status.${l.status}`)}
                </span>
                <span className="metric text-sm text-ink">
                  {nf.format(l.throughput)}
                  <span className="font-body text-[0.65rem] font-normal text-muted">
                    /{nf.format(l.target)} {t("lines.unitsHr")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* 3 — PLC Status */}
        <Panel title={t("panels.plc")}>
          <ul className="space-y-2.5">
            {s.plc.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-ink" dir="ltr">{p.id}</span>
                <span className="font-mono text-[0.65rem] text-muted" dir="ltr">{p.model}</span>
                <span className="font-mono text-xs text-muted" dir="ltr">
                  {nf.format(p.cycleMs)} ms
                </span>
                <Dot tone={statusColor[p.status]} />
              </li>
            ))}
          </ul>
        </Panel>

        {/* 4 — SCADA Status */}
        <Panel title={t("panels.scada")}>
          <ul className="space-y-2.5">
            {s.scada.servers.map((sv) => (
              <li key={sv.id} className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink" dir="ltr">{sv.id}</span>
                <span className="font-body text-xs text-muted">
                  {t("scadaP.latency")}{" "}
                  <span className="font-mono" dir="ltr">{nf.format(sv.latencyMs)} ms</span>
                </span>
                <Dot tone={statusColor[sv.status]} />
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 font-body text-xs text-muted">
            <p>
              {t("scadaP.tags")}
              <span className="metric mt-0.5 block text-base text-ink">
                {nf.format(s.scada.tagsPolled)}
              </span>
            </p>
            <p>
              {t("scadaP.rate")}
              <span className="metric mt-0.5 block text-base text-ink" dir="ltr">
                {nf.format(s.scada.updateRateMs)} ms
              </span>
            </p>
          </div>
        </Panel>

        {/* 5 — OT Network */}
        <Panel title={t("panels.network")}>
          <div className="grid grid-cols-2 gap-3">
            <p className="font-body text-xs text-muted">
              {t("networkP.online")}
              <span className="metric mt-0.5 block text-xl text-ink">
                {nf.format(s.network.online)}/{nf.format(s.network.devices)}
              </span>
            </p>
            <p className="font-body text-xs text-muted">
              {t("networkP.blocked")}
              <span className="metric mt-0.5 block text-xl text-ink">
                {nf.format(s.network.blockedEvents)}
              </span>
            </p>
          </div>
          <p className="mt-3 border-t border-line pt-3 font-body text-xs text-muted">
            {t("networkP.ids")}:{" "}
            <span className={statusColor[s.network.ids]}>
              {t(`status.${s.network.ids}`)}
            </span>
          </p>
        </Panel>

        {/* 6 — Alarm Summary */}
        <Panel title={t("panels.alarms")} className="md:col-span-2">
          <div className="flex flex-wrap items-center gap-4">
            <p className="metric text-3xl text-ink">{nf.format(totalAlarms)}</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(s.alarms.counts) as Severity[]).map((sev) => (
                <span
                  key={sev}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-body text-xs text-muted"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${sevColor[sev]}`} />
                  {t(`severity.${sev}`)}{" "}
                  <span className="font-mono text-ink">{nf.format(s.alarms.counts[sev])}</span>
                </span>
              ))}
            </div>
          </div>
          <ul className="mt-4 space-y-2 border-t border-line pt-3">
            {s.alarms.recent.slice(0, 4).map((a) => (
              <li key={a.id} className="flex items-center gap-2.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sevColor[a.severity]}`} />
                <span className="flex-1 truncate font-body text-xs text-ink">
                  {t(`alarmsP.msgs.${a.msgKey}`)}
                </span>
                <span className="font-mono text-[0.65rem] text-muted" dir="ltr">
                  {tf.format(a.ts)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* 7/8/9 — Temperature / Pressure / Flow */}
        <Panel title={t("panels.temperature")}>
          <MetricRows list={s.temperature} nf={nf} />
        </Panel>
        <Panel title={t("panels.pressure")}>
          <MetricRows list={s.pressure} nf={nf} />
        </Panel>
        <Panel title={t("panels.flow")}>
          <MetricRows list={s.flow} nf={nf} />
        </Panel>

        {/* 10 — Energy */}
        <Panel title={t("panels.energy")}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-body text-xs text-muted">{t("energyP.now")}</p>
              <p className="metric text-2xl text-ink">
                {nf.format(s.energy.nowKw)}
                <span className="font-body text-xs font-normal text-muted" dir="ltr"> kW</span>
              </p>
            </div>
            <Spark data={s.energy.history} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 font-body text-xs text-muted">
            <p>
              {t("energyP.today")}
              <span className="metric mt-0.5 block text-base text-ink" dir="ltr">
                {nf.format(s.energy.todayKwh)} kWh
              </span>
            </p>
            <p>
              {t("energyP.peak")}
              <span className="metric mt-0.5 block text-base text-ink" dir="ltr">
                {nf.format(s.energy.peakKw)} kW
              </span>
            </p>
          </div>
        </Panel>

        {/* 11 — AI Recommendations */}
        <Panel title={t("panels.ai")} className="md:col-span-2">
          <ul className="space-y-3">
            {s.ai.map((r) => (
              <li key={r.id} className="rounded-xl border border-line/70 bg-surface2/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-sm font-semibold text-ink leading-snug">
                    {t(`aiP.recs.${r.recKey}.title`)}
                  </h3>
                  <span className="shrink-0 rounded-full border border-signal/20 bg-signal/[0.05] px-2 py-0.5 font-mono text-[0.65rem] text-signal">
                    {nf.format(Math.round(r.confidence * 100))}{pct}
                  </span>
                </div>
                <p className="mt-1.5 font-body text-xs leading-relaxed text-muted">
                  {t(`aiP.recs.${r.recKey}.desc`)}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-body text-[0.7rem] text-muted/70">{t("aiP.note")}</p>
        </Panel>

        {/* 12 — Maintenance Priority */}
        <Panel title={t("panels.maintenance")} className="md:col-span-2">
          <ul className="space-y-2.5">
            {s.maintenance.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <span className="metric w-6 text-center text-base text-muted">
                  {nf.format(m.priority)}
                </span>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sevColor[m.severity]}`} />
                <span className="flex-1 truncate font-body text-xs text-ink">
                  {t(`maintenanceP.assets.${m.assetKey}`)}
                </span>
                <span className="font-mono text-[0.65rem] text-muted">
                  {nf.format(m.dueDays)} {t("maintenanceP.due")}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
