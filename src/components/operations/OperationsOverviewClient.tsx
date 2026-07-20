"use client";

import { useLocale } from "next-intl";
import { formatNumber } from "@/lib/i18n/format";

import { useState, useEffect } from "react";
import type { OperationsOverview } from "@/lib/operations/types";
import { PLATFORM_COMPONENTS }    from "@/lib/industrial/platform-facts";



const COMPONENT_LABEL: Record<string, string> = {
  brainEngine:     "Hermes Reasoning Engine",
  knowledgeCloud:  "Hermes Knowledge Cloud",
  caseEngine:      "Hermes Memory Engine",
  telemetry:       "Telemetry Network",
  plcConnectivity: "Industrial Graph",
};

const STATE_BADGE: Record<string, string> = {
  online:    "hs-badge hs--reasoning",
  simulated: "hs-badge hs--warning",
  phase2:    "hs-badge hs--nominal",
};
const STATE_LABEL: Record<string, string> = {
  online:    "ONLINE",
  simulated: "SIMULATED",
  phase2:    "PHASE 2",
};

// Intelligence feed items: deterministic, derived from static knowledge
const FEED_ITEMS = [
  { id: 1, severity: "critical", vendor: "Omron",     label: "Safety E-Stop Active — Sysmac NX1P2",          category: "Safety"  },
  { id: 2, severity: "critical", vendor: "Siemens",   label: "PLC Scan Overrun — S7-1500 CPU",               category: "CPU"     },
  { id: 3, severity: "critical", vendor: "ABB",       label: "Drive Overcurrent 2310 — ACS580",              category: "Power"   },
  { id: 4, severity: "critical", vendor: "Delta",     label: "Drive Overheat OH — VFD-M",                    category: "Thermal" },
  { id: 5, severity: "critical", vendor: "Schneider", label: "Drive Output Current Fault — Altivar ATV320",  category: "Power"   },
  { id: 6, severity: "warning",  vendor: "Siemens",   label: "PROFINET Bus Fault — S7-1200",                 category: "Communication" },
  { id: 7, severity: "warning",  vendor: "ABB",       label: "Motor Current Imbalance — IE3 Motor",          category: "Motor"   },
  { id: 8, severity: "warning",  vendor: "Phoenix",   label: "MQTT Connection Drop — PLCnext AXC F",         category: "IoT Network" },
] as const;

const SEV_BADGE: Record<string, string> = {
  critical: "hs-badge hs--risk",
  warning:  "hs-badge hs--warning",
  info:     "hs-badge hs--nominal",
};

function LoadingCell() {
  return <div className="h-8 w-16 rounded bg-surface2 animate-pulse" />;
}

export function OperationsOverviewClient() {
  const locale = useLocale();
  const [data,    setData]    = useState<OperationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/operations/overview")
      .then(r => r.json())
      .then((d: OperationsOverview) => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to load"); setLoading(false); });
  }, []);

  return (
    <div className="flex flex-col gap-5">

      {/* ── Enterprise KPI Strip ───────────────────────────────────────────── */}
      <div className="global-ops-strip">
        {[
          { label: "Vendors",         value: data?.vendors,        color: "text-signal" },
          { label: "Assets",          value: data?.assets,         color: "text-ink" },
          { label: "Protocols",       value: data?.protocols,      color: "text-ice" },
          { label: "Alarm Types",     value: data?.alarms,         color: "text-warn" },
          { label: "Cases",           value: data?.cases,          color: "text-ink" },
          { label: "Knowledge Links", value: data?.knowledgeLinks, color: "text-ink" },
          {
            label: "System Health",
            value: data ? `${data.systemHealth}%` : undefined,
            color: (data?.systemHealth ?? 0) >= 70 ? "text-signal"
                 : (data?.systemHealth ?? 0) >= 50 ? "text-warn"
                 : "text-danger",
          },
        ].map(kpi => (
          <div key={kpi.label} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{kpi.label}</p>
            {loading
              ? <LoadingCell />
              : <p className={`exec-kpi-value ${kpi.color}`}>
                  {kpi.value !== undefined ? kpi.value : "—"}
                </p>
            }
          </div>
        ))}
      </div>

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Left 2/3: Status Matrix + Feed */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Global Status Matrix */}
          <div className="rounded-xl border border-line bg-surface px-5 py-5">
            <div className="h-layer-sep mb-4">
              <span className="kpi-label">Global Status Matrix</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: "Online",
                  value: data?.onlineZones ?? 0,
                  sub:   "Vendor zones clean",
                  color: "text-signal",
                  border: "border-signal/20",
                  bg:    "bg-signal/[0.04]",
                },
                {
                  label: "Warning",
                  value: data?.warningZones ?? 0,
                  sub:   "Documented warnings",
                  color: "text-warn",
                  border: "border-warn/20",
                  bg:    "bg-warn/[0.04]",
                },
                {
                  label: "Critical",
                  value: data?.criticalZones ?? 0,
                  sub:   "Critical alarm types",
                  color: "text-danger",
                  border: "border-danger/20",
                  bg:    "bg-danger/[0.04]",
                },
                {
                  label: "Simulated",
                  value: data?.simulatedComponents ?? 0,
                  sub:   "Phase-2 components",
                  color: "text-muted",
                  border: "border-line",
                  bg:    "bg-surface",
                },
              ].map(cell => (
                <div
                  key={cell.label}
                  className={`rounded-xl border ${cell.border} ${cell.bg} px-4 py-4`}
                >
                  <p className="kpi-label mb-1.5">{cell.label}</p>
                  {loading
                    ? <div className="h-8 w-10 rounded bg-surface2 animate-pulse mb-1" />
                    : <p className={`exec-kpi-value mb-1 ${cell.color}`}>{cell.value}</p>
                  }
                  <p className="kpi-label text-faint">{cell.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Cross-Site Intelligence Feed */}
          <div className="rounded-xl border border-line bg-surface px-5 py-5">
            <div className="h-layer-sep mb-4">
              <span className="kpi-label">Cross-Site Intelligence Feed</span>
            </div>
            <p className="kpi-label text-faint mb-3">
              Deterministic — sourced from engineering knowledge base · {FEED_ITEMS.length} active signals
            </p>
            <div className="space-y-1.5">
              {FEED_ITEMS.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded border border-line bg-bg px-3 py-2"
                >
                  <span className={SEV_BADGE[item.severity]}>{item.severity.toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-xs text-ink truncate">{item.label}</p>
                  </div>
                  <span className="font-mono text-[0.60rem] text-faint flex-shrink-0">{item.vendor}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1/3: Platform Intelligence + Situation Awareness */}
        <div className="flex flex-col gap-5">

          {/* Platform Intelligence */}
          <div className="rounded-xl h-s3 px-4 py-4">
            <div className="h-layer-sep mb-3">
              <span className="kpi-label">Platform Intelligence</span>
            </div>
            <div className="space-y-2">
              {PLATFORM_COMPONENTS.map(comp => (
                <div
                  key={comp.key}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="font-body text-xs text-ink truncate">
                    {COMPONENT_LABEL[comp.key] ?? comp.key}
                  </span>
                  <span className={STATE_BADGE[comp.state] ?? "hs-badge hs--nominal"}>
                    {STATE_LABEL[comp.state] ?? comp.state.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Executive Situation Awareness */}
          <div className="rounded-xl border border-line bg-surface px-4 py-4 flex-1">
            <div className="h-layer-sep mb-3">
              <span className="kpi-label">Situation Awareness</span>
            </div>
            {loading
              ? <div className="space-y-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-4 rounded bg-surface2 animate-pulse" />
                  ))}
                </div>
              : error
              ? <p className="kpi-label text-danger">{error}</p>
              : (
                <div className="space-y-3">
                  <div className="rounded border border-danger/20 bg-danger/[0.04] px-3 py-2.5">
                    <p className="kpi-label text-danger mb-1">CRITICAL · {data?.criticalAlarms} active</p>
                    <p className="font-body text-xs text-ink">
                      Safety, CPU, Power, and Thermal alarm types require immediate engineering attention.
                    </p>
                  </div>
                  <div className="rounded border border-warn/20 bg-warn/[0.04] px-3 py-2.5">
                    <p className="kpi-label text-warn mb-1">WARNING · {data?.warningAlarms} active</p>
                    <p className="font-body text-xs text-ink">
                      Communication, network, and sensor alarms documented with resolutions.
                    </p>
                  </div>
                  <div className="rounded border border-signal/15 bg-signal/[0.03] px-3 py-2.5">
                    <p className="kpi-label text-signal mb-1">KNOWLEDGE COVERAGE</p>
                    <p className="font-body text-xs text-ink">
                      {formatNumber(data?.cases ?? 0, locale)} engineering cases · {formatNumber(data?.knowledgeLinks ?? 0, locale)} documented resolutions available.
                    </p>
                  </div>
                  <div className="rounded border border-line bg-bg px-3 py-2.5">
                    <p className="kpi-label text-faint mb-1">READ-ONLY PLATFORM</p>
                    <p className="font-body text-xs text-muted">
                      No PLC writes. No AI inference. All analysis is deterministic and traceable.
                    </p>
                  </div>
                </div>
              )
            }
          </div>
        </div>
      </div>
    </div>
  );
}
