"use client";

import type { CmmsDashboard } from "@/lib/cmms/types";

const PRIORITY_COLOR: Record<string, string> = {
  LOW:       "text-green-400",
  MEDIUM:    "text-yellow-400",
  HIGH:      "text-orange-400",
  CRITICAL:  "text-red-500",
  EMERGENCY: "text-red-700 font-bold",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT:       "bg-slate-500/20 text-slate-400",
  PLANNED:     "bg-blue-500/20 text-blue-400",
  SCHEDULED:   "bg-cyan-500/20 text-cyan-400",
  IN_PROGRESS: "bg-yellow-500/20 text-yellow-400",
  ON_HOLD:     "bg-purple-500/20 text-purple-400",
  COMPLETED:   "bg-green-500/20 text-green-400",
  CANCELLED:   "bg-slate-600/20 text-slate-500",
  OVERDUE:     "bg-red-500/20 text-red-400",
};

function KpiCard({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color ?? "text-foreground"}`}>
        {value}<span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
      </div>
    </div>
  );
}

export function CmmsDashboardClient({ data }: { data: CmmsDashboard }) {
  const { kpis, tasksByStatus, tasksByPriority, recentTasks, recentFailures, upcomingTasks } = data;

  return (
    <div className="space-y-8">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        <KpiCard label="MTBF"              value={kpis.mtbf}                    unit="h"  color="text-blue-400" />
        <KpiCard label="MTTR"              value={kpis.mttr}                    unit="h"  color="text-orange-400" />
        <KpiCard label="Availability"      value={`${kpis.availability}%`}                color={kpis.availability >= 95 ? "text-green-400" : "text-red-400"} />
        <KpiCard label="PM Compliance"     value={`${kpis.maintenanceCompliance}%`}       color={kpis.maintenanceCompliance >= 90 ? "text-green-400" : "text-yellow-400"} />
        <KpiCard label="Overdue Tasks"     value={kpis.overdueCount}                      color={kpis.overdueCount > 0 ? "text-red-400" : "text-green-400"} />
        <KpiCard label="Emergency Work"    value={`${kpis.emergencyWorkPct}%`}            color={kpis.emergencyWorkPct > 10 ? "text-red-400" : "text-green-400"} />
        <KpiCard label="Tech Utilization"  value={`${kpis.technicianUtilization}%`}       color="text-cyan-400" />
        <KpiCard label="Downtime"          value={kpis.totalDowntimeHours}     unit="h"  color="text-yellow-400" />
        <KpiCard label="Failures (30d)"    value={kpis.failureCount}                      color={kpis.failureCount > 3 ? "text-red-400" : "text-green-400"} />
        <KpiCard label="Completed (30d)"   value={kpis.completedThisMonth}                color="text-green-400" />
        <KpiCard label="Scheduled (30d)"   value={kpis.scheduledThisMonth}                color="text-blue-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tasks by Status */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <h3 className="font-semibold mb-4">Tasks by Status</h3>
          <div className="space-y-2">
            {Object.entries(tasksByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[status] ?? "bg-slate-500/20 text-slate-400"}`}>
                  {status.replace("_", " ")}
                </span>
                <span className="font-bold text-sm">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tasks by Priority */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <h3 className="font-semibold mb-4">Tasks by Priority</h3>
          <div className="space-y-2">
            {Object.entries(tasksByPriority).map(([pri, count]) => (
              <div key={pri} className="flex items-center justify-between">
                <span className={`text-sm font-medium ${PRIORITY_COLOR[pri] ?? ""}`}>{pri}</span>
                <span className="font-bold text-sm">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <h3 className="font-semibold mb-4">Upcoming Scheduled</h3>
          <div className="space-y-3">
            {upcomingTasks.length === 0 && <p className="text-muted-foreground text-sm">No upcoming tasks</p>}
            {upcomingTasks.map(t => (
              <div key={t.id} className="border-l-2 border-primary/40 pl-3">
                <p className="text-sm font-medium truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t.scheduledDate ? new Date(t.scheduledDate).toLocaleDateString() : "—"} · {t.maintenanceType}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Work Orders */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm overflow-x-auto">
          <h3 className="font-semibold mb-4">Recent Work Orders</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs border-b border-white/10">
                <th className="text-left pb-2">Title</th>
                <th className="text-left pb-2">Status</th>
                <th className="text-left pb-2">Priority</th>
              </tr>
            </thead>
            <tbody>
              {recentTasks.map(t => (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 pr-3 max-w-[200px] truncate">{t.title}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLOR[t.status] ?? ""}`}>
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className={`py-2 text-xs font-medium ${PRIORITY_COLOR[t.priority] ?? ""}`}>
                    {t.priority}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent Failures */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm overflow-x-auto">
          <h3 className="font-semibold mb-4">Recent Failures</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs border-b border-white/10">
                <th className="text-left pb-2">Title</th>
                <th className="text-left pb-2">Severity</th>
                <th className="text-left pb-2">Occurred</th>
              </tr>
            </thead>
            <tbody>
              {recentFailures.map(f => (
                <tr key={f.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 pr-3 max-w-[200px] truncate">{f.title}</td>
                  <td className="py-2 pr-3">
                    <span className={`text-xs font-medium ${
                      f.severity === "CRITICAL" ? "text-red-400" :
                      f.severity === "MAJOR"    ? "text-orange-400" :
                      f.severity === "MODERATE" ? "text-yellow-400" : "text-green-400"
                    }`}>{f.severity}</span>
                  </td>
                  <td className="py-2 text-muted-foreground text-xs">
                    {new Date(f.occurredAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
