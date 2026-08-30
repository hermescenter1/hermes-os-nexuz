"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createLocalDemoFrame,
  isValidSourceDescriptor,
  validateDashboardFrame,
  type ClassifiedDashboardFrame,
  type DashboardSourceDescriptor,
  type FrameRejectionReason,
} from "@/lib/dashboard-demo";
import { ExecutiveOverview } from "./ExecutiveOverview";
import { DashboardCommandSurface } from "./DashboardCommandSurface";
import {
  SimulatedBar,
  SimulatedModeChip,
  SimulatedProvenanceNote,
  SimulatedStatus,
  SimulatedValue,
  SimulatedWatermark,
  DEVICE_TONE,
  HEALTH_TONE,
  LINE_TONE,
  RISK_TREND_TONE,
  STATUS_TONE_CLASS,
} from "./SimulatedDataDisclosure";
import { ExecKpiStrip }     from "@/components/ui/ExecKpiStrip";
import { HermesSignal }     from "@/components/hermes/HermesSignal";
import { usePlatformFacts } from "@/lib/industrial/use-platform-facts";
import { EcosystemStatus }  from "@/components/hermes/EcosystemStatus";
import { DashboardSkeleton, DataUnavailableState } from "@/components/dashboard-experience";
import type {
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
  executive = false,
}: {
  title:       string;
  children:    React.ReactNode;
  className?:  string;
  compact?:    boolean;
  executive?:  boolean;
}) {
  // PHASE 104-I.D2 — elevation now comes from the DNA scale (--shadow-e2/e3)
  // instead of two hand-written rgba() shadows. The literals bypassed the token
  // layer entirely, so this panel could not follow a theme change and its depth
  // drifted from every other surface in the shell.
  return (
    <section
      className={`rounded-xl border ${executive ? "border-signal/10 bg-surface h-s3 shadow-e3" : "border-line bg-surface shadow-e2"} ${compact ? "p-4" : "p-5"} ${className}`}
    >
      <h2 className={executive ? "intel-title mb-4" : "type-panel-title mb-4"}>{title}</h2>
      {children}
    </section>
  );
}

/**
 * PHASE 104-I.D / D.0-R3 — status tone, split by semantic domain.
 *
 * This was ONE `Record<string, string>` serving four unrelated domains at once:
 * line lifecycle, device lifecycle, network health AND risk-trend direction.
 * That is how `down: "text-signal"` came to sit beside `offline: "text-danger"`
 * and `fault: "text-danger"` in the same table — correct for "risk trending
 * down", the opposite of correct for a device that is down. Because the record
 * was keyed by `string`, both readings type-checked and nothing could flag the
 * collision. Two of the five call sites also had no fallback, so a miss emitted
 * the class name `undefined` into `className`.
 *
 * The replacement — `LINE_TONE`, `DEVICE_TONE`, `HEALTH_TONE`,
 * `RISK_TREND_TONE` and the tone vocabulary itself — lives beside the glyph
 * table in `SimulatedDataDisclosure`, because tone, shape and word are one
 * contract and are tested as one.
 *
 * `sevColor` and `sevText` below are already keyed by `Severity` and are left
 * exactly as they are: their values are severity ramps (`bg-danger/70`,
 * `text-danger/80`), not members of the accepted tone vocabulary, and inventing
 * tone names for them is not what this stage was asked to do.
 */

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

/**
 * CORRECTION ROUND 2 — `StatusDot` is gone.
 *
 * It rendered a coloured dot with `aria-hidden="true"`, so a production line's
 * running/idle/fault state and every PLC and SCADA server state existed for
 * sighted users with colour vision and for nobody else — and carried no
 * disclosure at all. `SimulatedStatus` replaces it with a shape, a localized
 * word and the marker. Colour is now reinforcement, not the channel.
 */

/**
 * The sparkline is a snapshot-derived graphic. It was `aria-hidden`, which left
 * the history series with no accessible meaning and no disclosure; it now
 * carries a composed accessible name ending in the marker.
 */
function Spark({
  data,
  warn = false,
  label,
  path,
}: {
  data: number[];
  warn?: boolean;
  /** Already-localized description INCLUDING the simulated marker. */
  label: string;
  path: string;
}) {
  const w = 80; const h = 24;
  const min = Math.min(...data); const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`
  ).join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      style={{ direction: "ltr" }}
      role="img"
      aria-label={label}
      data-hermes-operational-value="simulated"
      data-hermes-snapshot-path={path}
    >
      <polyline points={pts} fill="none" stroke={warn ? "var(--warn)" : "var(--signal)"} strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

function MetricRows({
  list,
  nf,
  marker,
  pathBase,
}: {
  list: MetricSeries[];
  nf: Intl.NumberFormat;
  marker: string;
  /** "temperature" | "pressure" | "flow" — the snapshot array this row came from. */
  pathBase: string;
}) {
  const t = useTranslations("dashboard.metrics");
  return (
    <ul className="space-y-3">
      {list.map((m, i) => (
        <li key={m.tag} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              {/* The TAG is a simulated identifier, not chrome: it names a
                  sensor that does not exist. It carries its own marker rather
                  than borrowing the sibling value's. */}
              <SimulatedValue
                marker={marker}
                path={`${pathBase}[${i}].tag`}
                className="font-mono text-xs text-muted"
                dir="ltr"
              >
                {m.tag}
              </SimulatedValue>
              <SimulatedValue marker={marker} path={`${pathBase}[${i}].value`} className="metric text-base text-ink">
                {nf.format(m.value)}
                <span className="ms-1 font-body text-xs font-normal text-muted" dir="ltr">{m.unit}</span>
              </SimulatedValue>
            </div>
            <SimulatedValue as="p" marker={marker} path={`${pathBase}[${i}].range`} className="mt-0.5 font-body text-[0.65rem] text-metadata">
              {t("min")} {nf.format(m.min)} · {t("max")} {nf.format(m.max)}
            </SimulatedValue>
          </div>
          <Spark
            data={m.history}
            path={`${pathBase}[${i}].history`}
            label={`${m.tag} ${t("min")} ${nf.format(m.min)} ${t("max")} ${nf.format(m.max)} ${marker}`}
          />
        </li>
      ))}
    </ul>
  );
}

/* ── Main dashboard ────────────────────────────────────────────────────── */

/**
 * PHASE 109-B0 — the dashboard no longer fetches anything.
 *
 * It used to call `telemetryService.snapshot()`, which fetched the anonymous
 * `/api/telemetry` route, which returned `simulateSnapshot()` — plant-shaped
 * values served over an unauthenticated HTTP boundary with no tenant, no site,
 * no source identity and no provenance. That route and that service are retired.
 *
 * The dashboard is a legitimate DEMO consumer, so it keeps its demonstration
 * through an isolated local adapter: no HTTP request, no socket, no database
 * client and no route. `source` is resolved on the SERVER and passed in; the
 * client cannot choose it, and there is no query parameter or toggle that
 * changes it. Every frame the adapter produces is validated at runtime before
 * anything operational renders — a frame without classification or provenance
 * fails closed into the localized unavailable state rather than being rendered
 * with an assumed mode.
 */
export function DashboardClient({ source }: { source: DashboardSourceDescriptor }) {
  const t      = useTranslations("dashboard");
  const tp     = useTranslations("dashboard.provenance");
  const locale = useLocale();
  /* PHASE 104 R1 (V-M5) - shared with the ribbon and the Executive Overview,
     so this screen cannot print two different values for one quantity. */
  const facts  = usePlatformFacts();
  const [frame, setFrame]       = useState<ClassifiedDashboardFrame | null>(null);
  const [rejected, setRejected] = useState<FrameRejectionReason | null>(null);

  /* The server-resolved descriptor is itself checked. A malformed descriptor is
     a refusal, never a reason to assume a mode. */
  const descriptorValid = isValidSourceDescriptor(source);
  const { classification: srcClassification, connectionMode: srcMode } = source ?? {};

  useEffect(() => {
    if (!descriptorValid) {
      setFrame(null);
      setRejected("MISSING_PROVENANCE");
      return;
    }
    let live = true;
    function tick() {
      // No fetch, no await, no network: the frame is produced in-process.
      const candidate = createLocalDemoFrame();
      const verdict = validateDashboardFrame(candidate, source);
      if (!live) return;
      if (verdict.ok) { setFrame(verdict.frame); setRejected(null); }
      else { setFrame(null); setRejected(verdict.reason); }
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(id); };
    // `source` is a server-resolved constant; the primitives are its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptorValid, srcClassification, srcMode]);

  const nf  = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const tf  = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const pct = locale === "fa" ? "٪" : "%";
  const marker = tp("valueMarker");

  /* 109-B0 disclosure layer 1 — PERSISTENT means every state. The chip is
     rendered in the server-side markup and in all three client states
     (loading, refused, operating), so the mode is never absent from the page
     and a reader who arrives before hydration is not shown an undisclosed
     screen. */
  const modeChip = <SimulatedModeChip label={tp("chipLabel")} detail={tp("chipDetail")} />;

  // Fail closed. The raw rejection reason is NEVER shown to the user — only a
  // calm, localized panel — and no operational value is rendered beside it.
  if (rejected) return (
    <div className="mx-auto max-w-7xl px-6 sm:px-8 py-12">
      {modeChip}
      <DataUnavailableState
        title={t("command.unavailable.title")}
        body={t("command.unavailable.body")}
        hint={t("command.unavailable.hint")}
      />
    </div>
  );

  if (!frame) return (
    <div className="mx-auto max-w-7xl px-6 sm:px-8 pt-6">
      {modeChip}
      <DashboardSkeleton label={t("command.preparingDemo")} />
    </div>
  );

  const s = frame.snapshot;
  const provenanceRows = {
    scenarioValue:       tp("scenarioName"),
    classificationValue: frame.classification,
    connectionValue:     frame.connectionMode,
    qualityValue:        frame.quality,
    acquisitionValue:    tf.format(frame.acquisitionTs),
    receivedValue:       tf.format(frame.receivedTs),
    adapterValue:        frame.provenance.adapter,
  };
  const totalAlarms = s.alarms.counts.critical + s.alarms.counts.high + s.alarms.counts.medium + s.alarms.counts.low;

  return (
    <div className="mx-auto max-w-7xl px-6 sm:px-8 pb-20 pt-6">

      {/* ── 109-B0 disclosure layer 1: persistent, high-contrast mode chip ── */}
      {modeChip}

      {/* ── 109-B0 disclosure layer 2: the watermark covers the whole
             operational surface, so any screenshot of it carries the stamp. ── */}
      <div className="hermes-sim-surface">
        <SimulatedWatermark label={tp("watermark")} />
        <div className="hermes-sim-surface__content">

      {/* ── 87F: Operational command surface (attention → risk/evidence → safe
             actions), derived from the same snapshot. First, most-prioritized. ── */}
      <DashboardCommandSurface snap={s} valueMarker={marker} pathPrefix="command" />

      {/* ── KPI Strip ─────────────────────────────────────────────────────── */}
      <ExecKpiStrip valueNote={marker} items={[
        {
          label:  t("kpi.oee"),
          value:  nf.format(s.overview.oee),
          unit:   pct,
          trend:  s.overview.oee >= 80 ? "up" : s.overview.oee >= 65 ? "stable" : "down",
          delta:  `${nf.format(s.overview.availability)}${pct} avail`,
          path:      "overview.oee",
          deltaPath: "overview.availability",
        },
        {
          label:  t("kpi.lines"),
          value:  `${nf.format(s.overview.activeLines)}/${nf.format(s.overview.totalLines)}`,
          note:   t("kpi.linesNote"),
          path:   "overview.activeLines",
          // The note is a static caption, not a snapshot value, so it has no path.
        },
        {
          label:  t("kpi.alarms"),
          value:  nf.format(totalAlarms),
          accent: s.alarms.counts.critical > 0 ? "danger" : s.alarms.counts.high > 0 ? "warn" : "neutral",
          note:   `${nf.format(s.alarms.counts.critical)} ${t("kpi.critical")}`,
          path:      "alarms.total",
          deltaPath: "alarms.counts.critical",
        },
        {
          label:  t("kpi.risk"),
          value:  nf.format(s.risk.score),
          trend:  s.risk.trend === "up" ? "down" : s.risk.trend === "down" ? "up" : "stable",
          delta:  t(`riskP.trend.${s.risk.trend}`),
          accent: s.risk.score >= 75 ? "danger" : s.risk.score >= 50 ? "warn" : "neutral",
          path:      "risk.score",
          deltaPath: "risk.trend",
        },
        {
          label:  t("kpi.power"),
          value:  nf.format(s.energy.nowKw),
          unit:   "kW",
          note:   `${nf.format(s.energy.todayKwh)} kWh ${t("energyP.today")}`,
          path:      "energy.nowKw",
          deltaPath: "energy.todayKwh",
        },
      ]} />

      {/* ── Global Operations Center ──────────────────────────────────────── */}
      {/* NOTE — only the two snapshot-derived cells carry the simulated marker.
          Knowledge volume, engineering cases and supported vendors come from
          `usePlatformFacts`, which reports REAL published platform counts;
          marking those as simulated would be its own false statement. */}
      <div className="global-ops-strip">
        <div className="global-ops-cell">
          <p className="kpi-label mb-1.5">{t("command.globalOps.connectedAssets")}</p>
          <SimulatedValue as="p" marker={marker} path="network.devices" className="exec-kpi-value">{nf.format(s.network.devices)}</SimulatedValue>
        </div>
        <div className="global-ops-cell">
          <p className="kpi-label mb-1.5">{t("command.globalOps.knowledgeVolume")}</p>
          <p className="exec-kpi-value">{nf.format(facts.knowledgeLibraries)}</p>
        </div>
        <div className="global-ops-cell">
          <p className="kpi-label mb-1.5">{t("command.globalOps.engineeringCases")}</p>
          <p className="exec-kpi-value">{nf.format(facts.engineeringCases)}</p>
        </div>
        <div className="global-ops-cell">
          <p className="kpi-label mb-1.5">{t("command.globalOps.supportedVendors")}</p>
          <p className="exec-kpi-value">{nf.format(facts.supportedVendors)}</p>
        </div>
        <div className="global-ops-cell">
          <p className="kpi-label mb-1.5">{t("command.globalOps.platformPosture")}</p>
          <SimulatedValue as="p" marker={marker} path="derived.platformPosture"
            className={`exec-kpi-value ${100 - s.risk.score >= 70 ? "text-signal" : 100 - s.risk.score >= 50 ? "text-ink" : "text-warn"}`}>
            {nf.format(Math.max(0, Math.round(100 - s.risk.score)))}<span className="font-mono text-base font-normal text-muted ms-1">{pct}</span>
          </SimulatedValue>
        </div>
      </div>

      {/* ── Primary + Secondary row ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 mb-5">

        {/* PRIMARY — 2/3: Operational Command Center */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* 1A: Factory Operational Status */}
          <Panel title={t("panels.overview")} executive>
            {/* Site status strip */}
            <div className="flex items-center justify-between gap-3 mb-4 px-3 py-[7px] rounded border border-signal/[0.09] bg-surface">
              <SimulatedValue as="div" marker={marker} path="derived.operationalStatus">
                <HermesSignal
                  type={
                    s.alarms.counts.critical > 0 ? "risk-detected"
                    : s.alarms.counts.high > 0   ? "warning-active"
                    : "system-online"
                  }
                  label={
                    s.alarms.counts.critical > 0 ? t("command.signal.criticalEventsActive")
                    : s.alarms.counts.high > 0   ? t("command.signal.highPriorityEvents")
                    : t("command.signal.siteOperational")
                  }
                />
              </SimulatedValue>
              <SimulatedValue marker={marker} path="overview.activeLines" className="kpi-label">
                {t("command.signal.linesActive", { active: nf.format(s.overview.activeLines), total: nf.format(s.overview.totalLines) })}
              </SimulatedValue>
            </div>

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
                  <p className="kpi-label mb-1">{t(`overview.${k}`)}</p>
                  <SimulatedValue as="p" marker={marker} path={`overview.${k}`} className="exec-kpi-value">
                    {nf.format(v)}<span className="font-mono text-base font-normal text-muted ms-1">{pct}</span>
                  </SimulatedValue>
                  <SimulatedBar
                    fillPct={v}
                    background={v >= 80 ? "var(--signal)" : v >= 65 ? "var(--warn)" : "var(--danger)"}
                    label={`${t(`overview.${k}`)} ${nf.format(v)}${pct} ${marker}`}
                    path={`overview.${k}`}
                    trackClassName="mt-1.5 h-0.5 rounded bg-line"
                    fillClassName="h-0.5 rounded"
                  />
                </div>
              ))}
            </div>

            {/* Production Lines */}
            <div className="border-t border-line pt-4">
              <p className="type-eyebrow mb-3">{t("panels.lines")}</p>
              <ul className="grid sm:grid-cols-2 gap-2">
                {s.lines.map((l, li) => {
                  const fillPct = l.target > 0 ? Math.min(Math.round((l.throughput / l.target) * 100), 100) : 0;
                  return (
                    <li key={l.id} className="rounded-lg border border-line/50 bg-surface2/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        {/* The line ID names a production line that does not
                            exist; it is simulated output, not a static label. */}
                        <SimulatedValue marker={marker} path={`lines[${li}].id`} className="font-mono text-xs text-muted" dir="ltr">
                          {l.id}
                        </SimulatedValue>
                        <div className="flex items-center gap-2">
                          <SimulatedStatus
                            status={l.status}
                            label={t(`status.${l.status}`)}
                            marker={marker}
                            path={`lines[${li}].status`}
                            tone={LINE_TONE[l.status]}
                          />
                          <SimulatedValue marker={marker} path={`lines[${li}].throughput`} className="metric text-sm text-ink" dir="ltr">
                            {nf.format(l.throughput)}<span className="font-body text-[0.65rem] text-muted">/{nf.format(l.target)}</span>
                          </SimulatedValue>
                        </div>
                      </div>
                      <SimulatedBar
                        fillPct={fillPct}
                        background={fillPct >= 90 ? "var(--signal)" : fillPct >= 70 ? "var(--warn)" : "var(--danger)"}
                        label={`${l.id} ${nf.format(l.throughput)}/${nf.format(l.target)} ${marker}`}
                        path={`lines[${li}].fill`}
                        trackClassName="h-0.5 rounded bg-line"
                        fillClassName="h-0.5 rounded"
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </Panel>

          {/* 1B: Active Alarms */}
          <Panel title={t("panels.alarms")}>
            {/* Summary row */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <p className="kpi-label mb-1">{t("kpi.totalAlarms")}</p>
                <SimulatedValue as="p" marker={marker} path="alarms.total" className={`exec-kpi-value ${totalAlarms > 0 ? "text-ink" : "text-signal"}`}>
                  {nf.format(totalAlarms)}
                </SimulatedValue>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(s.alarms.counts) as Severity[]).map((sev) => (
                  <SimulatedValue
                    key={sev}
                    marker={marker}
                    path={`alarms.counts.${sev}`}
                    className={`hs-badge ${
                      sev === "critical" ? "hs--risk"
                      : sev === "high"   ? "hs--risk"
                      : sev === "medium" ? "hs--warning"
                      : "hs--nominal"
                    }`}
                  >
                    <span className={`hs-dot ${
                      sev === "critical" || sev === "high" ? "hs-dot--risk"
                      : sev === "medium" ? "hs-dot--warning"
                      : "hs-dot--nominal"
                    }`} />
                    {t(`severity.${sev}`)}
                    <span className="ms-1 font-mono font-bold opacity-90">{nf.format(s.alarms.counts[sev])}</span>
                  </SimulatedValue>
                ))}
              </div>
            </div>

            {/* Recent alarms list */}
            <ul className="space-y-2 border-t border-line pt-3">
              {s.alarms.recent.slice(0, 6).map((a, ai) => (
                <SimulatedValue as="li" marker={marker} path={`alarms.recent[${ai}]`} key={a.id}>
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${sevColor[a.severity]}`} />
                    <span className="flex-1 truncate font-body text-xs text-ink">
                      {t(`alarmsP.msgs.${a.msgKey}`)}
                    </span>
                    <span className={`shrink-0 font-body text-[0.65rem] ${sevText[a.severity]}`}>{t(`severity.${a.severity}`)}</span>
                    <span className="font-mono text-[0.65rem] text-metadata" dir="ltr">{tf.format(a.ts)}</span>
                  </span>
                </SimulatedValue>
              ))}
            </ul>
          </Panel>

        </div>

        {/* SECONDARY — 1/3: Risk Intelligence + Actions */}
        <div className="flex flex-col gap-5">

          {/* 2A: System Risk */}
          <Panel title={t("panels.risk")} executive>
            {/* Risk score hero */}
            <div className="text-center py-3 mb-4 border-b border-line">
              <SimulatedValue as="p" marker={marker} path="risk.score" className="cmd-kpi-value">{nf.format(s.risk.score)}</SimulatedValue>
              <SimulatedValue as="p" marker={marker} path="risk.trend" className={`mt-2 kpi-label ${STATUS_TONE_CLASS[RISK_TREND_TONE[s.risk.trend]]}`}>
                {t(`riskP.trend.${s.risk.trend}`)}
              </SimulatedValue>
            </div>

            {/* Risk factors */}
            <ul className="space-y-3">
              {s.risk.factors.map((f, fi) => (
                <li key={f.key}>
                  <div className="flex justify-between font-body text-xs mb-1">
                    <span className="text-muted">{t(`riskP.factors.${f.key}`)}</span>
                    <SimulatedValue marker={marker} path={`risk.factors[${fi}].weight`} className="font-mono text-ink">{nf.format(Math.round(f.weight * 100))}{pct}</SimulatedValue>
                  </div>
                  <SimulatedBar
                    fillPct={f.weight * 100}
                    background={f.weight > 0.6 ? "var(--danger)" : f.weight > 0.35 ? "var(--warn)" : "var(--signal)"}
                    label={`${t(`riskP.factors.${f.key}`)} ${nf.format(Math.round(f.weight * 100))}${pct} ${marker}`}
                    path={`risk.factors[${fi}].fill`}
                  />
                </li>
              ))}
            </ul>
          </Panel>

          {/* 2B: Asset Health Summary */}
          <Panel title={t("command.assetHealth.title")}>
            {(() => {
              const critical = s.maintenance.filter((m) => m.severity === "critical").length;
              const high     = s.maintenance.filter((m) => m.severity === "high").length;
              const medium   = s.maintenance.filter((m) => m.severity === "medium").length;
              const total    = s.maintenance.length;
              return (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[
                      { label: t("command.assetHealth.critical"), count: critical, color: "text-danger",  dot: "bg-danger",     path: "derived.assetHealth.critical" },
                      { label: t("command.assetHealth.high"),     count: high,     color: "text-danger/70",dot: "bg-danger/60", path: "derived.assetHealth.high"     },
                      { label: t("command.assetHealth.medium"),   count: medium,   color: "text-warn",    dot: "bg-warn",       path: "derived.assetHealth.medium"   },
                      { label: t("command.assetHealth.tracked"),  count: total,    color: "text-muted",   dot: "bg-muted/50",   path: "derived.assetHealth.tracked"  },
                    ].map((row) => (
                      <div key={row.label} className="rounded-lg border border-line/50 bg-surface2/40 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${row.dot}`} />
                          <span className="kpi-label">{row.label}</span>
                        </div>
                        <SimulatedValue as="p" marker={marker} path={row.path} className={`intel-kpi-value ${row.color}`}>{nf.format(row.count)}</SimulatedValue>
                      </div>
                    ))}
                  </div>
                  {critical > 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/[0.04] px-3 py-2">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-danger flex-shrink-0" />
                      <SimulatedValue as="p" marker={marker} path="derived.assetHealth.criticalWarning" className="font-body text-xs text-danger">
                        {t("command.assetHealth.criticalWarning", { count: nf.format(critical) })}
                      </SimulatedValue>
                    </div>
                  )}
                </>
              );
            })()}
          </Panel>

          {/* 2C: Action Required */}
          <Panel title={t("panels.maintenance")}>
            <ul className="space-y-2.5 mb-4">
              {s.maintenance.slice(0, 5).map((m, mi) => (
                <SimulatedValue as="li" marker={marker} path={`maintenance[${mi}]`} key={m.id}>
                  <span className="flex items-center gap-2.5">
                    <span className="metric w-5 text-center text-sm text-muted flex-shrink-0">
                      {nf.format(m.priority)}
                    </span>
                    <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${sevColor[m.severity]}`} />
                    <span className="flex-1 truncate font-body text-xs text-ink">
                      {t(`maintenanceP.assets.${m.assetKey}`)}
                    </span>
                    <span className="font-mono text-[0.65rem] text-metadata shrink-0">
                      {nf.format(m.dueDays)} {t("maintenanceP.due")}
                    </span>
                  </span>
                </SimulatedValue>
              ))}
            </ul>

            {/* Top AI recommendation */}
            {s.ai[0] && (
              <div className="border-t border-line pt-3">
                <p className="type-eyebrow mb-2">{t("aiP.topRec")}</p>
                <SimulatedValue as="div" marker={marker} path="ai[0]" className="rounded-lg border border-line/60 bg-surface2/50 p-3">
                  <span className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="font-body text-xs font-semibold text-ink leading-snug">
                      {t(`aiP.recs.${s.ai[0].recKey}.title`)}
                    </h3>
                    <span className="hs-badge hs--confident shrink-0">
                      {nf.format(Math.round(s.ai[0].confidence * 100))}{pct}
                    </span>
                  </span>
                  <span className="block font-body text-[0.7rem] leading-relaxed text-muted">
                    {t(`aiP.recs.${s.ai[0].recKey}.desc`)}
                  </span>
                </SimulatedValue>
              </div>
            )}
          </Panel>

        </div>
      </div>

      {/* ── Telemetry + Systems row ───────────────────────────────────────── */}
      <div className="h-layer-sep">
        <span className="kpi-label">{t("command.sections.telemetryControl")}</span>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 mb-6">

        {/* Thermal sensors */}
        <Panel title={t("panels.thermal")} compact>
          <p className="type-eyebrow mb-3">{t("panels.temperature")}</p>
          <MetricRows list={s.temperature} nf={nf} marker={marker} pathBase="temperature" />
          <div className="border-t border-line mt-4 pt-4">
            <p className="type-eyebrow mb-3">{t("panels.pressure")}</p>
            <MetricRows list={s.pressure} nf={nf} marker={marker} pathBase="pressure" />
          </div>
        </Panel>

        {/* Process & energy */}
        <Panel title={t("panels.process")} compact>
          <p className="type-eyebrow mb-3">{t("panels.flow")}</p>
          <MetricRows list={s.flow} nf={nf} marker={marker} pathBase="flow" />
          <div className="border-t border-line mt-4 pt-4">
            <p className="type-eyebrow mb-3">{t("panels.energy")}</p>
            <div className="flex items-end justify-between gap-2 mb-3">
              <div>
                <p className="font-body text-xs text-muted">{t("energyP.now")}</p>
                <SimulatedValue as="p" marker={marker} path="energy.nowKw" className="metric text-xl text-ink">
                  {nf.format(s.energy.nowKw)}<span className="font-body text-xs font-normal text-muted ms-1">kW</span>
                </SimulatedValue>
              </div>
              <Spark
                data={s.energy.history}
                path="energy.history"
                label={`${t("energyP.now")} ${nf.format(s.energy.nowKw)} kW ${t("energyP.peak")} ${nf.format(s.energy.peakKw)} kW ${marker}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-muted">
              <p>{t("energyP.today")}<SimulatedValue marker={marker} path="energy.todayKwh" className="metric block text-sm text-ink mt-0.5">{nf.format(s.energy.todayKwh)} kWh</SimulatedValue></p>
              <p>{t("energyP.peak")}<SimulatedValue marker={marker} path="energy.peakKw" className="metric block text-sm text-ink mt-0.5">{nf.format(s.energy.peakKw)} kW</SimulatedValue></p>
            </div>
          </div>
        </Panel>

        {/* Control systems */}
        <Panel title={t("panels.control")} compact>
          {/* SCADA */}
          <p className="type-eyebrow mb-2">{t("panels.scada")}</p>
          <ul className="space-y-2 mb-4">
            {s.scada.servers.map((sv, si) => (
              <SimulatedValue as="li" marker={marker} path={`scada.servers[${si}]`} key={sv.id}>
                <span className="flex items-center justify-between">
                  <span className="font-mono text-xs text-ink" dir="ltr">{sv.id}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[0.65rem] text-metadata">{nf.format(sv.latencyMs)}ms</span>
                    <SimulatedStatus
                      status={sv.status}
                      label={t(`status.${sv.status}`)}
                      marker={marker}
                      path={`scada.servers[${si}].status`}
                      tone={DEVICE_TONE[sv.status]}
                    />
                  </span>
                </span>
              </SimulatedValue>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-3 text-xs text-muted border-t border-line pt-3 mb-4">
            <p>{t("scadaP.tags")}<SimulatedValue marker={marker} path="scada.tagsPolled" className="metric block text-sm text-ink mt-0.5">{nf.format(s.scada.tagsPolled)}</SimulatedValue></p>
            <p>{t("scadaP.rate")}<SimulatedValue marker={marker} path="scada.updateRateMs" className="metric block text-sm text-ink mt-0.5">{nf.format(s.scada.updateRateMs)}ms</SimulatedValue></p>
          </div>

          {/* PLC */}
          <p className="type-eyebrow mb-2">{t("panels.plc")}</p>
          <ul className="space-y-1.5 mb-4">
            {s.plc.map((p, pi) => (
              <SimulatedValue as="li" marker={marker} path={`plc[${pi}]`} key={p.id}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink" dir="ltr">{p.id}</span>
                  <span className="font-mono text-[0.65rem] text-metadata">{nf.format(p.cycleMs)}ms</span>
                  <SimulatedStatus
                    status={p.status}
                    label={t(`status.${p.status}`)}
                    marker={marker}
                    path={`plc[${pi}].status`}
                    tone={DEVICE_TONE[p.status]}
                  />
                </span>
              </SimulatedValue>
            ))}
          </ul>

          {/* OT Network */}
          <div className="border-t border-line pt-3">
            <p className="type-eyebrow mb-2">{t("panels.network")}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">{t("networkP.online")}</span>
              <SimulatedValue marker={marker} path="network.online" className="metric text-sm text-ink">{nf.format(s.network.online)}/{nf.format(s.network.devices)}</SimulatedValue>
            </div>
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="text-muted">{t("networkP.ids")}</span>
              <SimulatedValue marker={marker} path="network.ids" className={`font-body text-xs ${STATUS_TONE_CLASS[HEALTH_TONE[s.network.ids]]}`}>{t(`status.${s.network.ids}`)}</SimulatedValue>
            </div>
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="text-muted">{t("networkP.blocked")}</span>
              <SimulatedValue marker={marker} path="network.blockedEvents" className="font-mono text-sm text-ink">{nf.format(s.network.blockedEvents)}</SimulatedValue>
            </div>
          </div>
        </Panel>
      </div>

      {/* ── AI Recommendations (full row) ────────────────────────────────── */}
      {s.ai.length > 1 && (
        <Panel title={t("panels.ai")} className="mb-6">
          <ul className="grid sm:grid-cols-2 gap-3">
            {s.ai.slice(1, 5).map((r, ri) => (
              <SimulatedValue as="li" key={r.id} marker={marker} path={`ai[${ri + 1}]`} className="rounded-lg border border-line/60 bg-surface2/50 p-4">
                <span className="flex items-start justify-between gap-3 mb-1.5">
                  <h3 className="font-body text-sm font-semibold text-ink leading-snug">
                    {t(`aiP.recs.${r.recKey}.title`)}
                  </h3>
                  <span className="hs-badge hs--confident shrink-0">
                    {nf.format(Math.round(r.confidence * 100))}{pct}
                  </span>
                </span>
                <span className="block font-body text-xs leading-relaxed text-muted">
                  {t(`aiP.recs.${r.recKey}.desc`)}
                </span>
              </SimulatedValue>
            ))}
          </ul>
          <p className="mt-3 font-body text-[0.7rem] text-metadata">{t("aiP.note")}</p>
        </Panel>
      )}

      {/* ── 109-B0 disclosure layer 4: the frame's own provenance, rendered ── */}
      <div className="mb-6">
        <SimulatedProvenanceNote
          title={tp("title")}
          body={tp("body")}
          scenarioLabel={tp("scenarioLabel")}
          scenarioValue={provenanceRows.scenarioValue}
          classificationLabel={tp("classificationLabel")}
          classificationValue={provenanceRows.classificationValue}
          connectionLabel={tp("connectionLabel")}
          connectionValue={provenanceRows.connectionValue}
          qualityLabel={tp("qualityLabel")}
          qualityValue={provenanceRows.qualityValue}
          acquisitionLabel={tp("acquisitionLabel")}
          acquisitionValue={provenanceRows.acquisitionValue}
          receivedLabel={tp("receivedLabel")}
          receivedValue={provenanceRows.receivedValue}
          adapterLabel={tp("adapterLabel")}
          adapterValue={provenanceRows.adapterValue}
        />
      </div>

      {/* ── Platform Intelligence ─────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="h-layer-sep mb-5">
          <span className="kpi-label">{t("platformIntel")}</span>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ExecutiveOverview />
          </div>
          <Panel title={t("command.sections.intelligenceNetwork")} executive>
            <EcosystemStatus />
          </Panel>
        </div>
      </div>

      {/* Timestamp */}
      <SimulatedValue as="p" marker={marker} path="snapshot.ts" className="kpi-label text-metadata" dir="ltr">
        {t("updated")} {tf.format(s.ts)}
      </SimulatedValue>

        </div>
      </div>
    </div>
  );
}
