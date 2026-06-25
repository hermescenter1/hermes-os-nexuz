"use client";

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
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Project Completion"    value={`${report.projectCompletionRate}%`} />
        <Stat label="Task Throughput"       value={report.taskThroughput}              subtext="tasks this week" />
        <Stat label="WO Completion Rate"    value={`${report.workOrderCompletionRate}%`} />
        <Stat label="Inventory Risk"        value={report.inventoryRisk}               subtext="low-stock items" />
        <Stat label="Resource Utilization"  value={`${report.resourceUtilization}%`}  />
        <Stat label="Budget Variance"       value={`${report.budgetVariance > 0 ? "+" : ""}${report.budgetVariance}%`} />
        <Stat label="Schedule Variance"     value={`${report.scheduleVariance > 0 ? "+" : ""}${report.scheduleVariance}d`} subtext="days ahead/behind" />
        <Stat label="Approval Cycle Time"   value={`${report.approvalCycleTime}h`}     subtext="avg time to decision" />
      </div>

      {report.kpis.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">Operational KPIs</h3>
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
