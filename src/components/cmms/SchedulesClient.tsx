"use client";

import type { MaintenanceSchedule } from "@/lib/cmms/types";

const STATUS_STYLE: Record<string, string> = {
  PLANNED:     "bg-blue-500/20 text-blue-400",
  SCHEDULED:   "bg-cyan-500/20 text-cyan-400",
  IN_PROGRESS: "bg-yellow-500/20 text-yellow-400",
  COMPLETED:   "bg-green-500/20 text-green-400",
  OVERDUE:     "bg-red-500/20 text-red-400",
  CANCELLED:   "bg-slate-500/20 text-slate-400",
};

export function SchedulesClient({ schedules }: { schedules: MaintenanceSchedule[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        Maintenance Schedules <span className="text-muted-foreground text-sm">({schedules.length})</span>
      </h2>
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-muted-foreground">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Priority</th>
              <th className="text-left px-4 py-3">Scheduled Date</th>
              <th className="text-left px-4 py-3">Est. Hours</th>
              <th className="text-left px-4 py-3">Technician</th>
              <th className="text-left px-4 py-3">Asset</th>
            </tr>
          </thead>
          <tbody>
            {schedules.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No schedules found</td></tr>
            )}
            {schedules.map(s => (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 font-medium max-w-[200px] truncate">{s.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[s.status] ?? ""}`}>
                    {s.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-medium">{s.priority}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(s.scheduledDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-xs">{s.estimatedHours}h</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{s.technicianId ?? "—"}</td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{s.assetId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
