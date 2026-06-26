"use client";

import Link from "next/link";
import type { AssetDashboard } from "@/lib/assets/types";
import { usePathname } from "next/navigation";



const STATUS_LABELS: Record<string, string> = {
  IN_SERVICE: "In Service", DEGRADED: "Degraded", UNDER_MAINTENANCE: "Under Maintenance",
  STANDBY: "Standby", PLANNED: "Planned", COMMISSIONED: "Commissioned",
  RETIRED: "Retired", REPLACED: "Replaced", DECOMMISSIONED: "Decommissioned",
};
const CRITICALITY_LABELS: Record<string, string> = {
  CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low", NON_CRITICAL: "Non-Critical",
};
const TYPE_LABELS: Record<string, string> = {
  PRODUCTION_LINE: "Production Line", MACHINE: "Machine", PLC: "PLC", HMI: "HMI",
  SCADA_NODE: "SCADA Node", ELECTRICAL_PANEL: "Electrical Panel", MCC_PANEL: "MCC Panel",
  VFD: "VFD", MOTOR: "Motor", PUMP: "Pump", VALVE: "Valve", SENSOR: "Sensor",
  INSTRUMENT: "Instrument", ROBOT: "Robot", CONVEYOR: "Conveyor", COMPRESSOR: "Compressor",
  UTILITY_SYSTEM: "Utility System", SAFETY_SYSTEM: "Safety System",
  NETWORK_DEVICE: "Network Device", INDUSTRIAL_PC: "Industrial PC",
};

function riskColor(state: string) {
  if (state === "HEALTHY")  return "text-signal bg-signal/[0.08]";
  if (state === "MONITOR")  return "text-ice bg-ice/[0.08]";
  if (state === "AT_RISK")  return "text-warn bg-warn/[0.10]";
  if (state === "CRITICAL") return "text-danger bg-danger/[0.10]";
  return "text-faint bg-surface2";
}

function criticalityColor(c: string) {
  if (c === "CRITICAL")    return "text-danger bg-danger/[0.10]";
  if (c === "HIGH")        return "text-warn bg-warn/[0.10]";
  if (c === "MEDIUM")      return "text-ice bg-ice/[0.08]";
  if (c === "LOW")         return "text-signal bg-signal/[0.08]";
  return "text-faint bg-surface2";
}

function healthColor(score: number) {
  if (score >= 85) return "bg-signal";
  if (score >= 65) return "bg-ice";
  if (score >= 40) return "bg-warn";
  return "bg-danger";
}

interface Props { data: AssetDashboard }

export function AssetsDashboardClient({ data }: Props) {
  const pathname = usePathname();
  const isFa    = pathname.startsWith("/fa");
  const locale  = isFa ? "fa" : "en";

  const kpis = [
    { label: isFa ? "کل دارایی‌ها" : "Total Assets",       value: data.totalAssets,       color: "border-ice/30",      sub: isFa ? "ثبت‌شده" : "registered" },
    { label: isFa ? "دارایی‌های بحرانی" : "Critical Assets", value: data.criticalAssets,    color: "border-danger/30",   sub: isFa ? "بحرانی" : "criticality level" },
    { label: isFa ? "تنزل‌یافته/در خطر" : "Degraded/At Risk",value: data.degradedAssets,   color: "border-warn/30",     sub: isFa ? "نیاز به توجه" : "needs attention" },
    { label: isFa ? "در خطر" : "At Risk",                    value: data.atRiskAssets,      color: "border-warn/30",     sub: isFa ? "رصد فعال" : "active monitoring" },
    { label: isFa ? "دستورکار باز" : "Open Work Orders",     value: data.assetsWithOpenWO,  color: "border-ice/30",      sub: isFa ? "دارایی مرتبط" : "assets linked" },
    { label: isFa ? "بدون سند" : "Missing Docs",             value: data.assetsMissingDocs, color: "border-signal/20",   sub: isFa ? "دارایی" : "assets" },
  ];

  return (
    <div className="space-y-8">
      {/* Module header */}
      <div className="card-enterprise rounded-xl p-6 border-s-4 border-ice/50">
        <p className="eyebrow-mono text-ice mb-1">{isFa ? "مدیریت دارایی‌های صنعتی" : "ENTERPRISE ASSET REGISTRY"}</p>
        <h1 className="text-2xl font-semibold text-ink">
          {isFa ? "داشبورد هوشمندی دارایی‌ها" : "Asset Intelligence Dashboard"}
        </h1>
        <p className="text-sm text-muted mt-1">
          {isFa
            ? "نمای جامع از وضعیت، سلامت، و چرخه عمر دارایی‌های صنعتی"
            : "Comprehensive view of industrial asset status, health, and lifecycle intelligence"}
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className={`card-enterprise rounded-xl p-4 border-s-2 ${k.color}`}>
            <p className="eyebrow-label text-faint mb-1">{k.label}</p>
            <p className="text-2xl font-semibold text-ink tabular-nums">{k.value}</p>
            <p className="text-xs text-faint mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Health distribution + Top critical */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Health distribution */}
        <div className="card-surface rounded-xl p-5">
          <p className="eyebrow-label text-faint mb-4">{isFa ? "توزیع سلامت دارایی‌ها" : "Health Distribution"}</p>
          <div className="space-y-3">
            {[
              { label: isFa ? "سالم" : "Healthy",  value: data.healthDistribution.healthy,  color: "bg-signal", textColor: "text-signal" },
              { label: isFa ? "رصد" : "Monitor",   value: data.healthDistribution.monitor,  color: "bg-ice",    textColor: "text-ice"    },
              { label: isFa ? "در خطر" : "At Risk", value: data.healthDistribution.atRisk,  color: "bg-warn",   textColor: "text-warn"   },
              { label: isFa ? "بحرانی" : "Critical",value: data.healthDistribution.critical,color: "bg-danger", textColor: "text-danger" },
              { label: isFa ? "نامشخص" : "Unknown", value: data.healthDistribution.unknown, color: "bg-line2",  textColor: "text-faint"  },
            ].map(row => {
              const pct = data.totalAssets ? Math.round((row.value / data.totalAssets) * 100) : 0;
              return (
                <div key={row.label}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-muted">{row.label}</span>
                    <span className={`text-sm font-medium ${row.textColor}`}>{row.value}</span>
                  </div>
                  <div className="h-1.5 bg-surface3 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Assets by type */}
        <div className="card-surface rounded-xl p-5">
          <p className="eyebrow-label text-faint mb-4">{isFa ? "دارایی‌ها بر اساس نوع" : "Assets by Type"}</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.assetsByType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div key={type} className="flex items-center gap-1.5 bg-ice/[0.06] border border-ice/15 rounded-lg px-3 py-1.5">
                  <span className="text-xs font-medium text-ice">{count}</span>
                  <span className="text-xs text-muted">{TYPE_LABELS[type] ?? type}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Criticality heatmap */}
      <div className="card-surface rounded-xl p-5">
        <p className="eyebrow-label text-faint mb-4">{isFa ? "توزیع بحرانیت" : "Criticality Distribution"}</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {["CRITICAL", "HIGH", "MEDIUM", "LOW", "NON_CRITICAL"].map(c => {
            const count = data.assetsByCriticality[c] ?? 0;
            return (
              <div key={c} className={`rounded-xl p-4 text-center ${criticalityColor(c)}`}>
                <p className="text-2xl font-semibold tabular-nums">{count}</p>
                <p className="text-xs mt-1 font-medium">{CRITICALITY_LABELS[c]}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top critical assets + Recent lifecycle events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top critical */}
        <div className="card-surface rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="eyebrow-label text-faint">{isFa ? "دارایی‌های بحرانی برتر" : "Top Critical Assets"}</p>
            <Link href={`/${locale}/assets/registry`} className="text-xs text-ice hover:underline">
              {isFa ? "همه" : "View all"}
            </Link>
          </div>
          <div className="space-y-2.5">
            {data.topCriticalAssets.map(a => (
              <Link key={a.id} href={`/${locale}/assets/${a.id}`}
                className="flex items-center gap-3 hover:bg-surface3 rounded-lg p-2 transition-colors group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate group-hover:text-ice">{a.name}</p>
                  <p className="text-xs text-faint">{a.assetNumber}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColor(a.riskState)}`}>
                    {a.riskState}
                  </span>
                  <div className="w-12">
                    <div className="h-1.5 bg-surface3 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${healthColor(a.healthScore)}`}
                        style={{ width: `${a.healthScore}%` }} />
                    </div>
                    <p className="text-xs text-faint text-end mt-0.5">{a.healthScore}%</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent lifecycle events */}
        <div className="card-surface rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="eyebrow-label text-faint">{isFa ? "رویدادهای اخیر چرخه عمر" : "Recent Lifecycle Events"}</p>
            <Link href={`/${locale}/assets/lifecycle`} className="text-xs text-ice hover:underline">
              {isFa ? "همه" : "View all"}
            </Link>
          </div>
          <div className="space-y-2.5">
            {data.recentLifecycleEvents.map(ev => (
              <div key={ev.id} className="flex gap-3 items-start">
                <div className="w-1.5 h-1.5 rounded-full bg-ice mt-2 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink font-medium">{ev.eventType.replace(/_/g, " ")}</p>
                  <p className="text-xs text-faint">{ev.notes ? ev.notes.slice(0, 60) + (ev.notes.length > 60 ? "…" : "") : ""}</p>
                  <p className="text-xs text-faint/70 mt-0.5">{new Date(ev.occurredAt).toLocaleDateString()}</p>
                </div>
                <span className="text-xs text-ice shrink-0">{ev.toState.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status distribution */}
      <div className="card-surface rounded-xl p-5">
        <p className="eyebrow-label text-faint mb-4">{isFa ? "وضعیت دارایی‌ها" : "Asset Status Distribution"}</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.assetsByStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
            <div key={status} className="flex items-center gap-2 bg-surface3 rounded-lg px-3 py-2 border border-line">
              <span className="text-sm font-semibold text-ink tabular-nums">{count}</span>
              <span className="text-xs text-muted">{STATUS_LABELS[status] ?? status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
