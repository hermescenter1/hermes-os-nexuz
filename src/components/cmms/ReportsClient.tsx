"use client";

import type { CmmsKpis } from "@/lib/cmms/types";

interface ReportData {
  kpis:            CmmsKpis;
  failurePareto:   { category: string; count: number }[];
  costByCategory:  Record<string, number>;
  totalCost:       number;
  lowStockParts:   number;
  totalParts:      number;
  taskSummary:     {
    total: number; completed: number; overdue: number;
    inProgress: number; planned: number;
  };
}

export function ReportsClient({ report }: { report: ReportData }) {
  const { kpis, failurePareto, costByCategory, totalCost, taskSummary } = report;

  return (
    <div className="space-y-8">
      {/* KPI Summary */}
      <section>
        <h2 className="text-base font-semibold mb-4">Equipment Reliability KPIs</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-muted-foreground mb-1">MTBF</div>
            <div className="text-2xl font-bold text-blue-400">{kpis.mtbf}<span className="text-sm text-muted-foreground ml-1">h</span></div>
            <div className="text-xs text-muted-foreground mt-1">Mean Time Between Failures</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-muted-foreground mb-1">MTTR</div>
            <div className="text-2xl font-bold text-orange-400">{kpis.mttr}<span className="text-sm text-muted-foreground ml-1">h</span></div>
            <div className="text-xs text-muted-foreground mt-1">Mean Time To Repair</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-muted-foreground mb-1">Availability</div>
            <div className={`text-2xl font-bold ${kpis.availability >= 95 ? "text-green-400" : "text-red-400"}`}>
              {kpis.availability}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">Equipment uptime</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-muted-foreground mb-1">PM Compliance</div>
            <div className={`text-2xl font-bold ${kpis.maintenanceCompliance >= 90 ? "text-green-400" : "text-yellow-400"}`}>
              {kpis.maintenanceCompliance}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">Preventive maintenance on-time</div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Failure Pareto */}
        <section>
          <h2 className="text-base font-semibold mb-4">Failure Pareto (by Category)</h2>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
            {failurePareto.map(({ category, count }, i) => {
              const max   = failurePareto[0]?.count ?? 1;
              const width = Math.round((count / max) * 100);
              return (
                <div key={category}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{i + 1}. {category}</span>
                    <span className="text-muted-foreground">{count} failures</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-primary to-primary/60"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Cost Breakdown */}
        <section>
          <h2 className="text-base font-semibold mb-4">Cost Breakdown</h2>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
            {Object.entries(costByCategory).map(([cat, amt]) => {
              const pct = Math.round((amt / (totalCost || 1)) * 100);
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{cat}</span>
                    <span className="text-muted-foreground">${Math.round(amt).toLocaleString()} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-gradient-to-r from-yellow-500 to-yellow-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-white/10 flex justify-between text-sm font-bold">
              <span>Total</span>
              <span>${Math.round(totalCost).toLocaleString()}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Task Summary */}
      <section>
        <h2 className="text-base font-semibold mb-4">Work Order Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { label: "Total", value: taskSummary.total, color: "" },
            { label: "Completed", value: taskSummary.completed, color: "text-green-400" },
            { label: "In Progress", value: taskSummary.inProgress, color: "text-yellow-400" },
            { label: "Planned", value: taskSummary.planned, color: "text-blue-400" },
            { label: "Overdue", value: taskSummary.overdue, color: "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
