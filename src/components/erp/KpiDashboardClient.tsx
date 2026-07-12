"use client";

import { useTranslations } from "next-intl";
import type { ErpKpiReport } from "@/lib/erp/types";

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

export function KpiDashboardClient({ report }: { report: ErpKpiReport }) {
  const t = useTranslations("enterpriseOperations");
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label={t("kpis.projectCompletion")}   value={`${report.projectCompletionRate}%`} />
        <Stat label={t("kpis.taskThroughput")}      value={report.taskThroughput}              subtext={t("kpis.tasksThisWeek")} />
        <Stat label={t("kpis.woCompletionRate")}    value={`${report.workOrderCompletionRate}%`} />
        <Stat label={t("kpis.inventoryRisk")}       value={report.inventoryRisk}               subtext={t("kpis.lowStockItems")} />
        <Stat label={t("kpis.resourceUtilization")} value={`${report.resourceUtilization}%`}  />
        <Stat label={t("kpis.budgetVariance")}      value={`${report.budgetVariance > 0 ? "+" : ""}${report.budgetVariance}%`} />
        <Stat label={t("kpis.scheduleVariance")}    value={`${report.scheduleVariance > 0 ? "+" : ""}${report.scheduleVariance}d`} subtext={t("kpis.daysAheadBehind")} />
        <Stat label={t("kpis.approvalCycleTime")}   value={`${report.approvalCycleTime}h`}     subtext={t("kpis.avgTimeToDecision")} />
      </div>

      {report.kpis.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">{t("kpis.heading")}</h3>
          <div className="space-y-4">
            {report.kpis.map(kpi => {
              const pct = kpi.target ? PCT_BAR(Math.round((kpi.value / kpi.target) * 100)) : null;
              return (
                <div key={kpi.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{kpi.name}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {kpi.category && <span className="capitalize">{kpi.category.toLowerCase()}</span>}
                      <span className="font-medium text-foreground">{kpi.value}{kpi.unit}</span>
                      {kpi.target && <span>/ {kpi.target}{kpi.unit}</span>}
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
        </div>
      )}
    </div>
  );
}
