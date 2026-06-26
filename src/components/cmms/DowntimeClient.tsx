"use client";

import type { MaintenanceDowntime } from "@/lib/cmms/types";

const REASON_STYLE: Record<string, string> = {
  PLANNED_MAINTENANCE: "bg-blue-500/15 text-blue-400",
  BREAKDOWN:           "bg-red-500/15 text-red-400",
  SETUP:               "bg-purple-500/15 text-purple-400",
  WAITING_PARTS:       "bg-yellow-500/15 text-yellow-400",
  WAITING_APPROVAL:    "bg-orange-500/15 text-orange-400",
  EXTERNAL:            "bg-slate-500/15 text-slate-400",
  UNKNOWN:             "bg-slate-600/15 text-slate-500",
};

export function DowntimeClient({ downtime }: { downtime: MaintenanceDowntime[] }) {
  const totalMinutes   = downtime.reduce((s, d) => s + (d.durationMinutes ?? 0), 0);
  const unplanned      = downtime.filter(d => d.reason !== "PLANNED_MAINTENANCE");
  const unplannedMinutes = unplanned.reduce((s, d) => s + (d.durationMinutes ?? 0), 0);
  const totalLoss      = downtime.reduce((s, d) => s + (d.productionLoss ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold">{Math.round(totalMinutes / 60)}h</div>
          <div className="text-xs text-muted-foreground mt-1">Total Downtime</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{Math.round(unplannedMinutes / 60)}h</div>
          <div className="text-xs text-muted-foreground mt-1">Unplanned</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{downtime.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Events</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">${totalLoss.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">Production Loss</div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-muted-foreground">
              <th className="text-left px-4 py-3">Asset</th>
              <th className="text-left px-4 py-3">Reason</th>
              <th className="text-left px-4 py-3">Started</th>
              <th className="text-left px-4 py-3">Duration</th>
              <th className="text-left px-4 py-3">Impact</th>
              <th className="text-right px-4 py-3">Loss (USD)</th>
            </tr>
          </thead>
          <tbody>
            {downtime.map(d => (
              <tr key={d.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 text-xs font-mono">{d.assetId ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${REASON_STYLE[d.reason] ?? ""}`}>
                    {d.reason.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(d.startedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-xs font-medium">
                  {d.durationMinutes != null ? `${Math.round(d.durationMinutes / 60)}h ${d.durationMinutes % 60}m` : "Ongoing"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                  {d.impact ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs text-right text-orange-400">
                  {d.productionLoss ? `$${d.productionLoss.toLocaleString()}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
