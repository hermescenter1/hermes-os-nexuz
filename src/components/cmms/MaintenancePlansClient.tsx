"use client";
import { usePathname } from "next/navigation";
import type { MaintenancePlan } from "@/lib/cmms/types";

const TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  PREVENTIVE:  { bg: "bg-ice/[0.08]",    text: "text-ice"    },
  PREDICTIVE:  { bg: "bg-signal/[0.08]", text: "text-signal" },
  INSPECTION:  { bg: "bg-ice/[0.08]",    text: "text-ice"    },
  LUBRICATION: { bg: "bg-warn/[0.08]",   text: "text-warn"   },
  CALIBRATION: { bg: "bg-warn/[0.10]",   text: "text-warn"   },
  CORRECTIVE:  { bg: "bg-danger/[0.08]", text: "text-danger" },
  EMERGENCY:   { bg: "bg-danger/[0.10]", text: "text-danger" },
  SHUTDOWN:    { bg: "bg-faint/[0.08]",  text: "text-faint"  },
};

const PRIORITY_DOT: Record<string, string> = {
  LOW:       "bg-signal",
  MEDIUM:    "bg-warn",
  HIGH:      "bg-warn",
  CRITICAL:  "bg-danger",
  EMERGENCY: "bg-danger",
};

export function MaintenancePlansClient({ plans }: { plans: MaintenancePlan[] }) {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-ink">{isFa ? "برنامه‌های نگهداشت" : "Maintenance Plans"}</h2>
        <span className="text-xs text-faint font-mono">({plans.length})</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.map(plan => {
          const overdue  = plan.nextDueAt && new Date(plan.nextDueAt) < new Date();
          const daysUntil = plan.nextDueAt
            ? Math.ceil((new Date(plan.nextDueAt).getTime() - Date.now()) / 86400000)
            : null;
          const t = TYPE_STYLE[plan.maintenanceType] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };

          return (
            <div
              key={plan.id}
              className="card-enterprise card-hover rounded-xl p-5 border border-line hover:border-warn/30 transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-4">
                <h3 className="font-semibold text-ink text-sm leading-snug line-clamp-2 flex-1">{plan.name}</h3>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${PRIORITY_DOT[plan.priority] ?? "bg-muted"}`} />
              </div>

              {/* Specs */}
              <div className="space-y-2 text-xs mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-faint">{isFa ? "نوع" : "Type"}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border border-white/[0.05] ${t.bg} ${t.text}`}>
                    {plan.maintenanceType}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-faint">{isFa ? "دوره" : "Frequency"}</span>
                  <span className="text-ink font-medium font-mono">{isFa ? `هر ${plan.frequencyDays} روز` : `Every ${plan.frequencyDays}d`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-faint">{isFa ? "مدت تخمینی" : "Est. Duration"}</span>
                  <span className="text-ink font-medium font-mono">{plan.estimatedHours}h</span>
                </div>
                {plan._count && (
                  <div className="flex items-center justify-between">
                    <span className="text-faint">{isFa ? "دستورکارها" : "Work Orders"}</span>
                    <span className="text-ink font-medium font-mono">{plan._count.tasks}</span>
                  </div>
                )}
              </div>

              {/* Due date */}
              {plan.nextDueAt && (
                <div className={`text-xs rounded-lg px-3 py-2 mb-3 font-medium ${
                  overdue
                    ? "bg-danger/[0.08] text-danger border border-danger/15"
                    : daysUntil !== null && daysUntil <= 7
                    ? "bg-warn/[0.08] text-warn border border-warn/15"
                    : "bg-signal/[0.06] text-signal border border-signal/15"
                }`}>
                  {overdue
                    ? `${isFa ? "معوقه" : "Overdue by"} ${Math.abs(daysUntil ?? 0)} ${isFa ? "روز" : "days"}`
                    : daysUntil !== null
                    ? `${isFa ? "در" : "Due in"} ${daysUntil} ${isFa ? "روز" : "days"}`
                    : new Date(plan.nextDueAt).toLocaleDateString()}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-line">
                <span className={`text-xs font-medium px-2 py-0.5 rounded border border-white/[0.05] ${plan.isActive ? "bg-signal/[0.08] text-signal" : "bg-faint/[0.06] text-faint"}`}>
                  {plan.isActive ? (isFa ? "فعال" : "Active") : (isFa ? "غیرفعال" : "Inactive")}
                </span>
                {plan.lastExecutedAt && (
                  <span className="text-xs text-faint font-mono">
                    {isFa ? "آخرین" : "Last"}: {new Date(plan.lastExecutedAt).toLocaleDateString()}
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
