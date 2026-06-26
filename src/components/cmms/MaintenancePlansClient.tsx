"use client";

import type { MaintenancePlan } from "@/lib/cmms/types";

const TYPE_BADGE: Record<string, string> = {
  PREVENTIVE:  "bg-blue-500/20 text-blue-400",
  PREDICTIVE:  "bg-purple-500/20 text-purple-400",
  INSPECTION:  "bg-cyan-500/20 text-cyan-400",
  LUBRICATION: "bg-yellow-500/20 text-yellow-400",
  CALIBRATION: "bg-orange-500/20 text-orange-400",
  CORRECTIVE:  "bg-red-500/20 text-red-400",
  EMERGENCY:   "bg-red-700/20 text-red-600",
  SHUTDOWN:    "bg-slate-500/20 text-slate-300",
};

const PRIORITY_DOT: Record<string, string> = {
  LOW:       "bg-green-400",
  MEDIUM:    "bg-yellow-400",
  HIGH:      "bg-orange-400",
  CRITICAL:  "bg-red-500",
  EMERGENCY: "bg-red-700",
};

export function MaintenancePlansClient({ plans }: { plans: MaintenancePlan[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Maintenance Plans <span className="text-muted-foreground text-sm">({plans.length})</span></h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.map(plan => {
          const overdue = plan.nextDueAt && new Date(plan.nextDueAt) < new Date();
          const daysUntil = plan.nextDueAt
            ? Math.ceil((new Date(plan.nextDueAt).getTime() - Date.now()) / 86400000)
            : null;

          return (
            <div
              key={plan.id}
              className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-semibold text-sm leading-snug line-clamp-2">{plan.name}</h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[plan.priority] ?? "bg-slate-400"}`} />
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
                <div className="flex items-center justify-between">
                  <span>Type</span>
                  <span className={`px-2 py-0.5 rounded font-medium ${TYPE_BADGE[plan.maintenanceType] ?? ""}`}>
                    {plan.maintenanceType}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Frequency</span>
                  <span className="text-foreground font-medium">Every {plan.frequencyDays}d</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Est. Duration</span>
                  <span className="text-foreground font-medium">{plan.estimatedHours}h</span>
                </div>
                {plan._count && (
                  <div className="flex items-center justify-between">
                    <span>Work Orders</span>
                    <span className="text-foreground font-medium">{plan._count.tasks}</span>
                  </div>
                )}
              </div>

              {plan.nextDueAt && (
                <div className={`text-xs rounded-lg px-3 py-2 ${overdue ? "bg-red-500/10 text-red-400" : daysUntil !== null && daysUntil <= 7 ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>
                  {overdue
                    ? `Overdue by ${Math.abs(daysUntil ?? 0)} days`
                    : daysUntil !== null
                    ? `Due in ${daysUntil} days`
                    : "Due: " + new Date(plan.nextDueAt).toLocaleDateString()}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded ${plan.isActive ? "bg-green-500/15 text-green-400" : "bg-slate-500/15 text-slate-400"}`}>
                  {plan.isActive ? "Active" : "Inactive"}
                </span>
                {plan.lastExecutedAt && (
                  <span className="text-xs text-muted-foreground">
                    Last: {new Date(plan.lastExecutedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
