"use client";

import { useTranslations } from "next-intl";
import type { CompletionDurationMetric, ErpKpiReportView } from "@/lib/erp/operations";

const PCT_BAR = (v: number) => Math.min(100, Math.max(0, v));

function Stat({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
    </div>
  );
}

/** A null value is shown as a dash (not measured) so it is never mistaken for zero. */
const orDash = (v: number | null, format: (n: number) => string): string => (v === null ? "—" : format(v));

export function KpiDashboardClient({ report }: { report: ErpKpiReportView }) {
  const t = useTranslations("enterpriseOperations");
  const restricted = t("financials.restricted");
  const duration = (label: string, m: CompletionDurationMetric) => (
    <Stat
      label={label}
      value={m.averageHours === null ? t("kpis.completionNone") : t("kpis.completionAverage", { hours: m.averageHours.toFixed(1) })}
      subtext={`${t("kpis.completionMeasured", { count: m.measuredRows })} · ${t("kpis.completionSkipped", { count: m.skippedRows })}`}
    />
  );
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label={t("kpis.projectCompletion")}   value={orDash(report.projectCompletionRate, n => `${n}%`)} />
        <Stat label={t("kpis.taskThroughput")}      value={orDash(report.taskThroughput, n => `${n}`)}       subtext={t("kpis.tasksThisWeek")} />
        <Stat label={t("kpis.woCompletionRate")}    value={orDash(report.workOrderCompletionRate, n => `${n}%`)} />
        <Stat label={t("kpis.inventoryRisk")}       value={orDash(report.inventoryRisk, n => `${n}`)}        subtext={t("kpis.lowStockItems")} />
        <Stat label={t("kpis.resourceUtilization")} value={t("utilization.insufficientData")} subtext={t("utilization.note")} />
        <Stat
          label={t("kpis.budgetVariance")}
          value={report.budgetVariance === null ? restricted : `${report.budgetVariance > 0 ? "+" : ""}${report.budgetVariance}%`}
        />
        <Stat label={t("kpis.scheduleVariance")}    value={orDash(report.scheduleVariance, n => `${n > 0 ? "+" : ""}${n}d`)} subtext={t("kpis.daysAheadBehind")} />
        <Stat label={t("kpis.approvalCycleTime")}   value={orDash(report.approvalCycleTime, n => `${n}h`)}   subtext={t("kpis.avgTimeToDecision")} />
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold mb-4">{t("kpis.completionTitle")}</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {duration(t("kpis.completionTasks"), report.completionDurations.tasks)}
          {duration(t("kpis.completionWorkOrders"), report.completionDurations.workOrders)}
        </div>
      </div>

      {report.kpis.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">{t("kpis.heading")}</h3>
          <div className="space-y-4">
            {report.kpis.map(kpi => {
              const hidden = kpi.value === null;
              const pct = !hidden && kpi.target ? PCT_BAR(Math.round(((kpi.value as number) / kpi.target) * 100)) : null;
              return (
                <div key={kpi.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{kpi.name}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {kpi.category && <span className="capitalize">{kpi.category.toLowerCase()}</span>}
                      <span className="font-medium text-foreground">{hidden ? restricted : `${kpi.value}${kpi.unit ?? ""}`}</span>
                      {!hidden && kpi.target && <span>/ {kpi.target}{kpi.unit}</span>}
                    </div>
                  </div>
                  {pct !== null && (
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  {kpi.category && (
                    <div className="text-xs text-muted-foreground mt-0.5 capitalize">{kpi.category.toLowerCase()}</div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{t("kpis.recentLimited", { count: report.kpisLimit })}</p>
        </div>
      )}
    </div>
  );
}
