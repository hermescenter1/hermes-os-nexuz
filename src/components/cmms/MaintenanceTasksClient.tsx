"use client";

import type { MaintenanceTask } from "@/lib/cmms/types";

const STATUS_STYLE: Record<string, string> = {
  DRAFT:       "bg-slate-500/20 text-slate-400",
  PLANNED:     "bg-blue-500/20 text-blue-400",
  SCHEDULED:   "bg-cyan-500/20 text-cyan-400",
  IN_PROGRESS: "bg-yellow-500/20 text-yellow-400",
  ON_HOLD:     "bg-purple-500/20 text-purple-400",
  COMPLETED:   "bg-green-500/20 text-green-400",
  CANCELLED:   "bg-slate-600/20 text-slate-500",
  OVERDUE:     "bg-red-500/20 text-red-400",
};

const PRIORITY_STYLE: Record<string, string> = {
  LOW:       "text-green-400",
  MEDIUM:    "text-yellow-400",
  HIGH:      "text-orange-400",
  CRITICAL:  "text-red-500",
  EMERGENCY: "text-red-700",
};

export function MaintenanceTasksClient({
  tasks, title = "Work Orders",
}: { tasks: MaintenanceTask[]; title?: string }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        {title} <span className="text-muted-foreground text-sm">({tasks.length})</span>
      </h2>

      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-muted-foreground">
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Priority</th>
              <th className="text-left px-4 py-3">Technician</th>
              <th className="text-left px-4 py-3">Scheduled</th>
              <th className="text-left px-4 py-3">Est. h</th>
              <th className="text-left px-4 py-3">WO Type</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No tasks found</td></tr>
            )}
            {tasks.map(t => (
              <tr key={t.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 max-w-[240px]">
                  <p className="font-medium truncate">{t.title}</p>
                  {t.assetId && <p className="text-xs text-muted-foreground truncate">{t.assetId}</p>}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{t.maintenanceType}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[t.status] ?? ""}`}>
                    {t.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className={`px-4 py-3 text-xs font-bold ${PRIORITY_STYLE[t.priority] ?? ""}`}>
                  {t.priority}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{t.technicianId ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {t.scheduledDate ? new Date(t.scheduledDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-right">{t.estimatedHours ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{t.workOrderType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
