"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { telemetryService } from "@/lib/services/telemetry-service";
import { ExecutiveOverview } from "./ExecutiveOverview";
import { ExecKpiStrip }     from "@/components/ui/ExecKpiStrip";
import type {
  DashboardSnapshot,
  MetricSeries,
  Severity,
} from "@/lib/services/types";

const POLL_MS = 5_000;

/* ── Shared sub-components ─────────────────────────────────────────────── */

function Panel({
  title,
  children,
  className = "",
  compact = false,
}: {
  title:      string;
  children:   React.ReactNode;
  className?: string;
  compact?:   boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface ${compact ? "p-4" : "p-5"} ${className}`}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
    >
      <h2 className="type-panel-title mb-4">{title}</h2>
      {children}
    </section>
  );
}

const statusColor: Record<string, string> = {
  running:  "text-signal",
  online:   "text-signal",
  ok:       "text-signal",
  idle:     "text-muted",
  flat:     "text-muted",
  warning:  "text-warn",
  degraded: "text-warn",
  up:       "text-danger",
  fault:    "text-danger",
  offline:  "text-danger",
  down:     "text-signal",
};

const sevColor: Record<Severity, string> = {
  critical: "bg-danger",
  high:     "bg-danger/70",
  medium:   "bg-warn",
  low:      "bg-muted/50",
};

const sevText: Record<Severity, string> = {
  critical: "text-danger",
  high:     "text-danger/80",
  medium:   "text-warn",
  low:      "text-muted",
};

function StatusDot({ tone }: { tone: string }) {
  const color = tone.includes("signal")
    ? "bg-signal"
    : tone.includes("warn")
      ? "bg-warn"
      : tone.includes("danger")
        ? "bg-danger"
        : "bg-muted/60";
  return (
    <span className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${color}`} aria-hidden="true" />
  );
}

function Spark({ data, warn = false }: { data: number[]; warn?: boolean }) {
  const w = 80; const h = 24;
  const min = Math.min(...data); const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`
  ).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" style={{ direction: "ltr" }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={warn ? "var(--warn)" : "var(--signal)"} strokeWidth="1.5" strokeLinejoin="round"/>
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
              <span className="font-mono text-xs text-muted" dir="ltr">{m.tag}</span>
              <span className="metric text-base text-ink">
                {nf.format(m.value)}
                <span className="ms-1 font-body text-xs font-normal text-muted" dir="ltr">{m.unit}</span>
              </span>
            </div>
            <p className="mt-0.5 font-body text-[0.65rem] text-faint">
              {t("min")} {nf.format(m.min)} · {t("max")} {nf.format(m.max)}
            </p>
          </div>
          <Spark data={m.history} />
        </li>
      ))}
    </ul>
  );
}

/* ── Main dashboard ────────────────────────────────────────────────────── */

export function DashboardClient() {
  const t      = useTranslations("dashboard");
  const locale = useLocale();
  const [snap, setSnap]   = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    async function tick() {
      const r = await telemetryService.snapshot();
      if (!live) return;
      if (r.ok) { setSnap(r.data); setError(null); }
      else setError(r.error);
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(id); };
  }, []);

  const nf  = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const tf  = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const pct = locale === "fa" ? "٪" : "%";

  if (error) return (
    <div className="mx-auto max-w-7xl px-6 sm:px-8 py-12">
      <p className="rounded-xl border border-danger/30 bg-surface px-5 py-4 font-mono text-sm text-danger">{error}</p>
    </div>
  );

  if (!snap) return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <p className="animate-pulse font-mono text-sm text-muted">···</p>
    </div>
  );

  const s = snap;
  const totalAlarms = s.alarms.counts.critical + s.alarms.counts.high + s.alarms.counts.medium + s.alarms.counts.low;

  return (
    <div className="mx-auto max-w-7xl px-6 sm:px-8 pb-20 pt-6">

      {/* ── KPI Strip ─────────────────────────────────────────────────────── */}
      <ExecKpiStrip items={[
        {
          label:  t("kpi.oee"),
          value:  nf.format(s.overview.oee),
          unit:   pct,
          trend:  s.overview.oee >= 80 ? "up" : s.overview.oee >= 65 ? "stable" : "down",
          delta:  `${nf.format(s.overview.availability)}${pct} avail`,
        },
        {
          label:  t("kpi.lines"),
          value:  `${nf.format(s.overview.activeLines)}/${nf.format(s.overview.totalLines)}`,
          note:   t("kpi.linesNote"),
        },
        {
          label:  t("kpi.alarms"),
          value:  nf.format(totalAlarms),
          accent: s.alarms.counts.critical > 0 ? "danger" : s.alarms.counts.high > 0 ? "warn" : "neutral",
          note:   `${nf.format(s.alarms.counts.critical)} ${t("kpi.critical")}`,
        },
        {
          label:  t("kpi.risk"),
          value:  nf.format(s.risk.score),
          trend:  s.risk.trend === "up" ? "down" : s.risk.trend === "down" ? "up" : "stable",
          delta:  t(`riskP.trend.${s.risk.trend}`),
          accent: s.risk.score >= 75 ? "danger" : s.risk.score >= 50 ? "warn" : "neutral",
        },
        {
          label:  t("kpi.power"),
          value:  nf.format(s.energy.nowKw),
          unit:   "kW",
          note:   `${nf.format(s.energy.todayKwh)} kWh ${t("energyP.today")}`,
        },
      ]} />

      {/* ── Primary + Secondary row ────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3 mb-5">

        {/* PRIMARY — 2/3: Operational Command Center */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* 1A: Factory Operational Status */}
          <Panel title={t("panels.overview")}>
            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4 mb-5">
              {(
                [
                  ["oee",          s.overview.oee],
                  ["availability", s.overview.availability],
                  ["performance",  s.overview.performance],
                  ["quality",      s.overview.quality],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <p className="type-caption mb-0.5">{t(`overview.${k}`)}</p>
                  <p className="metric text-2xl text-ink">
                    {nf.format(v)}<span className="text-sm text-muted ms-0.5">{pct}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* Production Lines */}
            <div className="border-t border-line pt-4">
              <p className="type-eyebrow mb-3">{t("panels.lines")}</p>
              <ul className="grid sm:grid-cols-2 gap-2">
                {s.lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-line/50 bg-surface2/50 px-3 py-2">
                    <span className="font-mono text-xs text-muted" dir="ltr">{l.id}</span>
                    <div className="flex items-center gap-2">
                      <StatusDot tone={statusColor[l.status] ?? ""} />
                      <span className="metric text-sm text-ink" dir="ltr">
                        {nf.format(l.throughput)}<span className="font-body text-[0.65rem] text-muted">/{nf.format(l.target)}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-body text-xs text-muted">
                {t("overview.activeLines")}:{" "}
                <span className="font-mono text-ink">{nf.format(s.overview.activeLines)}/{nf.format(s.overview.totalLines)}</span>
              </p>
            </div>
          </Panel>

          {/* 1B: Active Alarms */}
          <Panel title={t("panels.alarms")}>
            {/* Summary row */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <p className="type-caption mb-0.5">{t("kpi.totalAlarms")}</p>
                <p className={`metric text-3xl ${totalAlarms > 0 ? "text-ink" : "text-signal"}`}>
                  {nf.format(totalAlarms)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(s.alarms.counts) as Severity[]).map((sev) => (
                  <span
                    key={sev}
                    className="inline-flex items-center gap-1.5 rounded border border-line/60 bg-surface2/50 px-2.5 py-1 font-body text-xs"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${sevColor[sev]}`} />
                    <span className={sevText[sev]}>{t(`severity.${sev}`)}</span>
                    <span className="font-mono text-ink ms-0.5">{nf.format(s.alarms.counts[sev])}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Recent alarms list */}
            <ul className="space-y-2 border-t border-line pt-3">
              {s.alarms.recent.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center gap-2.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sevColor[a.severity]}`} />
                  <span className="flex-1 truncate font-body text-xs text-ink">
                    {t(`alarmsP.msgs.${a.msgKey}`)}
                  </span>
                  <span className={`shrink-0 font-body text-[0.65rem] ${sevText[a.severity]}`}>{t(`severity.${a.severity}`)}</span>
                  <span className="font-mono text-[0.65rem] text-faint" dir="ltr">{tf.format(a.ts)}</span>
                </li>
              ))}
            </ul>
          </Panel>

        </div>

        {/* SECONDARY — 1/3: Risk Intelligence + Actions */}
        <div className="flex flex-col gap-5">

          {/* 2A: System Risk */}
          <Panel title={t("panels.risk")}>
            {/* Risk score hero */}
            <div className="text-center py-3 mb-4 border-b border-line">
              <p className="metric text-5xl text-ink leading-none">{nf.format(s.risk.score)}</p>
              <p className={`mt-2 font-body text-sm ${statusColor[s.risk.trend]}`}>
                {t(`riskP.trend.${s.risk.trend}`)}
              </p>
            </div>

            {/* Risk factors */}
            <ul className="space-y-3">
              {s.risk.factors.map((f) => (
                <li key={f.key}>
                  <div className="flex justify-between font-body text-xs mb-1">
                    <span className="text-muted">{t(`riskP.factors.${f.key}`)}</span>
                    <span className="font-mono text-ink">{nf.format(Math.round(f.weight * 100))}{pct}</span>
                  </div>
                  <div className="h-1 rounded bg-line">
                    <div
                      className="h-1 rounded"
                      style={{
                        inlineSize: `${Math.min(f.weight * 100, 100)}%`,
                        background: f.weight > 0.6 ? "var(--danger)" : f.weight > 0.35 ? "var(--warn)" : "var(--signal)",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          {/* 2B: Action Required */}
          <Panel title={t("panels.maintenance")}>
            <ul className="space-y-2.5 mb-4">
              {s.maintenance.slice(0, 5).map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <span className="metric w-5 text-center text-sm text-muted flex-shrink-0">
                    {nf.format(m.priority)}
                  </span>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sevColor[m.severity]}`} />
                  <span className="flex-1 truncate font-body text-xs text-ink">
                    {t(`maintenanceP.assets.${m.assetKey}`)}
                  </span>
                  <span className="font-mono text-[0.65rem] text-faint shrink-0">
                    {nf.format(m.dueDays)} {t("maintenanceP.due")}
                  </span>
                </li>
              ))}
            </ul>

            {/* Top AI recommendation */}
            {s.ai[0] && (
              <div className="border-t border-line pt-3">
                <p className="type-eyebrow mb-2">{t("aiP.topRec")}</p>
                <div className="rounded-lg border border-line/60 bg-surface2/50 p-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="font-body text-xs font-semibold text-ink leading-snug">
                      {t(`aiP.recs.${s.ai[0].recKey}.title`)}
                    </h3>
                    <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[0.60rem] text-muted">
                      {nf.format(Math.round(s.ai[0].confidence * 100))}{pct}
                    </span>
                  </div>
                  <p className="font-body text-[0.7rem] leading-relaxed text-muted">
                    {t(`aiP.recs.${s.ai[0].recKey}.desc`)}
                  </p>
                </div>
              </div>
            )}
          </Panel>

        </div>
      </div>

      {/* ── Telemetry + Systems row ───────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3 mb-6">

        {/* Thermal sensors */}
        <Panel title={t("panels.thermal")} compact>
          <p className="type-eyebrow mb-3">{t("panels.temperature")}</p>
          <MetricRows list={s.temperature} nf={nf} />
          <div className="border-t border-line mt-4 pt-4">
            <p className="type-eyebrow mb-3">{t("panels.pressure")}</p>
            <MetricRows list={s.pressure} nf={nf} />
          </div>
        </Panel>

        {/* Process & energy */}
        <Panel title={t("panels.process")} compact>
          <p className="type-eyebrow mb-3">{t("panels.flow")}</p>
          <MetricRows list={s.flow} nf={nf} />
          <div className="border-t border-line mt-4 pt-4">
            <p className="type-eyebrow mb-3">{t("panels.energy")}</p>
            <div className="flex items-end justify-between gap-2 mb-3">
              <div>
                <p className="font-body text-xs text-muted">{t("energyP.now")}</p>
                <p className="metric text-xl text-ink">
                  {nf.format(s.energy.nowKw)}<span className="font-body text-xs font-normal text-muted ms-1">kW</span>
                </p>
              </div>
              <Spark data={s.energy.history} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-muted">
              <p>{t("energyP.today")}<span className="metric block text-sm text-ink mt-0.5">{nf.format(s.energy.todayKwh)} kWh</span></p>
              <p>{t("energyP.peak")}<span className="metric block text-sm text-ink mt-0.5">{nf.format(s.energy.peakKw)} kW</span></p>
            </div>
          </div>
        </Panel>

        {/* Control systems */}
        <Panel title={t("panels.control")} compact>
          {/* SCADA */}
          <p className="type-eyebrow mb-2">{t("panels.scada")}</p>
          <ul className="space-y-2 mb-4">
            {s.scada.servers.map((sv) => (
              <li key={sv.id} className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink" dir="ltr">{sv.id}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[0.65rem] text-faint">{nf.format(sv.latencyMs)}ms</span>
                  <StatusDot tone={statusColor[sv.status] ?? ""} />
                </div>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-3 text-xs text-muted border-t border-line pt-3 mb-4">
            <p>{t("scadaP.tags")}<span className="metric block text-sm text-ink mt-0.5">{nf.format(s.scada.tagsPolled)}</span></p>
            <p>{t("scadaP.rate")}<span className="metric block text-sm text-ink mt-0.5">{nf.format(s.scada.updateRateMs)}ms</span></p>
          </div>

          {/* PLC */}
          <p className="type-eyebrow mb-2">{t("panels.plc")}</p>
          <ul className="space-y-1.5 mb-4">
            {s.plc.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-ink" dir="ltr">{p.id}</span>
                <span className="font-mono text-[0.65rem] text-faint">{nf.format(p.cycleMs)}ms</span>
                <StatusDot tone={statusColor[p.status] ?? ""} />
              </li>
            ))}
          </ul>

          {/* OT Network */}
          <div className="border-t border-line pt-3">
            <p className="type-eyebrow mb-2">{t("panels.network")}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">{t("networkP.online")}</span>
              <span className="metric text-sm text-ink">{nf.format(s.network.online)}/{nf.format(s.network.devices)}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="text-muted">{t("networkP.ids")}</span>
              <span className={`font-body text-xs ${statusColor[s.network.ids]}`}>{t(`status.${s.network.ids}`)}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="text-muted">{t("networkP.blocked")}</span>
              <span className="font-mono text-sm text-ink">{nf.format(s.network.blockedEvents)}</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* ── AI Recommendations (full row) ────────────────────────────────── */}
      {s.ai.length > 1 && (
        <Panel title={t("panels.ai")} className="mb-6">
          <ul className="grid sm:grid-cols-2 gap-3">
            {s.ai.slice(1, 5).map((r) => (
              <li key={r.id} className="rounded-lg border border-line/60 bg-surface2/50 p-4">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <h3 className="font-body text-sm font-semibold text-ink leading-snug">
                    {t(`aiP.recs.${r.recKey}.title`)}
                  </h3>
                  <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[0.60rem] text-muted">
                    {nf.format(Math.round(r.confidence * 100))}{pct}
                  </span>
                </div>
                <p className="font-body text-xs leading-relaxed text-muted">
                  {t(`aiP.recs.${r.recKey}.desc`)}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-body text-[0.7rem] text-faint">{t("aiP.note")}</p>
        </Panel>
      )}

      {/* ── Platform Intelligence ─────────────────────────────────────────── */}
      <div className="border-t border-line pt-6 mb-4">
        <p className="type-eyebrow mb-5">{t("platformIntel")}</p>
        <ExecutiveOverview />
      </div>

      {/* Timestamp */}
      <p className="font-mono text-[0.65rem] text-faint" dir="ltr">
        {t("updated")} {tf.format(s.ts)}
      </p>
    </div>
  );
}
