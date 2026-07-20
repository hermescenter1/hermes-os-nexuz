"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { enumLabel } from "@/lib/i18n/enum-label";
import type { AssetDashboard } from "@/lib/assets/types";
import { formatDate } from "@/lib/i18n/format";

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
  const t      = useTranslations("assetOperations");
  const tAm    = useTranslations("assetMaintenance"); // 87L.5: Persian enum labels
  const locale = useLocale();

  // Raw enum -> display label; falls back to raw value when unmapped.
  const typeLabel   = (ty: string) => (t.has(`enums.typeFull.${ty}`) ? t(`enums.typeFull.${ty}`) : ty);
  const statusLabel = (s: string)  => (t.has(`enums.status.${s}`) ? t(`enums.status.${s}`) : s);

  const kpis = [
    { label: t("dashboard.kpiTotalLabel"),    value: data.totalAssets,       color: "border-ice/30",    sub: t("dashboard.kpiTotalSub") },
    { label: t("dashboard.kpiCriticalLabel"), value: data.criticalAssets,    color: "border-danger/30", sub: t("dashboard.kpiCriticalSub") },
    { label: t("dashboard.kpiDegradedLabel"), value: data.degradedAssets,    color: "border-warn/30",   sub: t("dashboard.kpiDegradedSub") },
    { label: t("dashboard.kpiAtRiskLabel"),   value: data.atRiskAssets,      color: "border-warn/30",   sub: t("dashboard.kpiAtRiskSub") },
    { label: t("dashboard.kpiOpenWoLabel"),   value: data.assetsWithOpenWO,  color: "border-ice/30",    sub: t("dashboard.kpiOpenWoSub") },
    { label: t("dashboard.kpiMissingDocsLabel"), value: data.assetsMissingDocs, color: "border-signal/20", sub: t("dashboard.kpiMissingDocsSub") },
  ];

  return (
    <div className="space-y-8">
      {/* Module header */}
      <div className="card-enterprise rounded-xl p-6 border-s-4 border-ice/50">
        <p className="eyebrow-mono text-ice mb-1">{t("dashboard.eyebrow")}</p>
        <h1 className="text-2xl font-semibold text-ink">
          {t("dashboard.title")}
        </h1>
        <p className="text-sm text-muted mt-1">
          {t("dashboard.subtitle")}
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
          <p className="eyebrow-label text-faint mb-4">{t("dashboard.healthDistribution")}</p>
          <div className="space-y-3">
            {[
              { label: t("dashboard.healthy"),  value: data.healthDistribution.healthy,  color: "bg-signal", textColor: "text-signal" },
              { label: t("dashboard.monitor"),  value: data.healthDistribution.monitor,  color: "bg-ice",    textColor: "text-ice"    },
              { label: t("dashboard.atRisk"),   value: data.healthDistribution.atRisk,   color: "bg-warn",   textColor: "text-warn"   },
              { label: t("dashboard.critical"), value: data.healthDistribution.critical, color: "bg-danger", textColor: "text-danger" },
              { label: t("dashboard.unknown"),  value: data.healthDistribution.unknown,  color: "bg-line2",  textColor: "text-faint"  },
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
          <p className="eyebrow-label text-faint mb-4">{t("dashboard.assetsByType")}</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.assetsByType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div key={type} className="flex items-center gap-1.5 bg-ice/[0.06] border border-ice/15 rounded-lg px-3 py-1.5">
                  <span className="text-xs font-medium text-ice">{count}</span>
                  <span className="text-xs text-muted">{typeLabel(type)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Criticality heatmap */}
      <div className="card-surface rounded-xl p-5">
        <p className="eyebrow-label text-faint mb-4">{t("dashboard.criticalityDistribution")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {["CRITICAL", "HIGH", "MEDIUM", "LOW", "NON_CRITICAL"].map(c => {
            const count = data.assetsByCriticality[c] ?? 0;
            return (
              <div key={c} className={`rounded-xl p-4 text-center ${criticalityColor(c)}`}>
                <p className="text-2xl font-semibold tabular-nums">{count}</p>
                <p className="text-xs mt-1 font-medium">{t(`enums.criticality.${c}`)}</p>
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
            <p className="eyebrow-label text-faint">{t("dashboard.topCriticalAssets")}</p>
            <Link href={`/${locale}/assets/registry`} className="text-xs text-ice hover:underline">
              {t("common.viewAll")}
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
            <p className="eyebrow-label text-faint">{t("dashboard.recentLifecycleEvents")}</p>
            <Link href={`/${locale}/assets/lifecycle`} className="text-xs text-ice hover:underline">
              {t("common.viewAll")}
            </Link>
          </div>
          <div className="space-y-2.5">
            {data.recentLifecycleEvents.map(ev => (
              <div key={ev.id} className="flex gap-3 items-start">
                <div className="w-1.5 h-1.5 rounded-full bg-ice mt-2 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink font-medium">{enumLabel(t, "enums.eventType", ev.eventType)}</p>
                  <p className="text-xs text-faint">{ev.notes ? ev.notes.slice(0, 60) + (ev.notes.length > 60 ? "…" : "") : ""}</p>
                  <p className="text-xs text-faint/70 mt-0.5">{formatDate(ev.occurredAt, locale)}</p>
                </div>
                <span className="text-xs text-ice shrink-0">{enumLabel(tAm, "lifecycle", ev.toState)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status distribution */}
      <div className="card-surface rounded-xl p-5">
        <p className="eyebrow-label text-faint mb-4">{t("dashboard.statusDistribution")}</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.assetsByStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
            <div key={status} className="flex items-center gap-2 bg-surface3 rounded-lg px-3 py-2 border border-line">
              <span className="text-sm font-semibold text-ink tabular-nums">{count}</span>
              <span className="text-xs text-muted">{statusLabel(status)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
