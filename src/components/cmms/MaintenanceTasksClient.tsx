"use client";
import { usePathname } from "next/navigation";
import type { MaintenanceTask } from "@/lib/cmms/types";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT:       { bg: "bg-faint/[0.08]",  text: "text-faint"  },
  PLANNED:     { bg: "bg-ice/[0.08]",    text: "text-ice"    },
  SCHEDULED:   { bg: "bg-signal/[0.08]", text: "text-signal" },
  IN_PROGRESS: { bg: "bg-warn/[0.10]",   text: "text-warn"   },
  ON_HOLD:     { bg: "bg-muted/[0.08]",  text: "text-muted"  },
  COMPLETED:   { bg: "bg-signal/[0.08]", text: "text-signal" },
  CANCELLED:   { bg: "bg-faint/[0.06]",  text: "text-faint"  },
  OVERDUE:     { bg: "bg-danger/[0.10]", text: "text-danger" },
};

const PRIORITY_STYLE: Record<string, string> = {
  LOW:       "text-signal",
  MEDIUM:    "text-warn",
  HIGH:      "text-warn",
  CRITICAL:  "text-danger",
  EMERGENCY: "text-danger",
};

export function MaintenanceTasksClient({
  tasks,
  title,
}: { tasks: MaintenanceTask[]; title?: string }) {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");
  const heading  = title ?? (isFa ? "دستورکارها" : "Work Orders");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-ink">{heading}</h2>
        <span className="text-xs text-faint font-mono">({tasks.length})</span>
      </div>

      <div className="card-enterprise rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface2">
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "عنوان" : "Title"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{isFa ? "نوع" : "Type"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "وضعیت" : "Status"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "اولویت" : "Priority"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{isFa ? "تکنیسین" : "Technician"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{isFa ? "زمان‌بندی" : "Scheduled"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden xl:table-cell">{isFa ? "ساعت تخمینی" : "Est. h"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-muted text-sm">
                  {isFa ? "دستورکاری یافت نشد" : "No tasks found"}
                </td>
              </tr>
            ) : (
              tasks.map(t => {
                const s = STATUS_STYLE[t.status] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
                return (
                  <tr key={t.id} className="hover:bg-surface2 transition-colors">
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="font-medium text-ink truncate">{t.title}</p>
                      {t.assetId && <p className="text-xs text-faint font-mono truncate">{t.assetId}</p>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-muted">{t.maintenanceType}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-white/[0.05] ${s.bg} ${s.text}`}>
                        {t.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs font-bold ${PRIORITY_STYLE[t.priority] ?? "text-muted"}`}>
                      {t.priority}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-muted">{t.technicianId ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-faint font-mono">
                        {t.scheduledDate ? new Date(t.scheduledDate).toLocaleDateString() : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-end">
                      <span className="text-xs font-mono text-muted">{t.estimatedHours ?? "—"}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
