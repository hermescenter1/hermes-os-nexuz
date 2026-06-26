"use client";
import { usePathname } from "next/navigation";
import type { CmmsDashboard } from "@/lib/cmms/types";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT:       { bg: "bg-faint/[0.08]",   text: "text-faint"  },
  PLANNED:     { bg: "bg-ice/[0.08]",     text: "text-ice"    },
  SCHEDULED:   { bg: "bg-signal/[0.08]",  text: "text-signal" },
  IN_PROGRESS: { bg: "bg-warn/[0.10]",    text: "text-warn"   },
  ON_HOLD:     { bg: "bg-muted/[0.08]",   text: "text-muted"  },
  COMPLETED:   { bg: "bg-signal/[0.08]",  text: "text-signal" },
  CANCELLED:   { bg: "bg-faint/[0.06]",   text: "text-faint"  },
  OVERDUE:     { bg: "bg-danger/[0.10]",  text: "text-danger" },
};

const PRIORITY_STYLE: Record<string, string> = {
  LOW:       "text-signal",
  MEDIUM:    "text-warn",
  HIGH:      "text-warn",
  CRITICAL:  "text-danger",
  EMERGENCY: "text-danger",
};

const SEV_STYLE: Record<string, string> = {
  MINOR:    "text-signal",
  MODERATE: "text-warn",
  MAJOR:    "text-warn",
  CRITICAL: "text-danger",
};

export function CmmsDashboardClient({ data }: { data: CmmsDashboard }) {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");
  const { kpis, tasksByStatus, tasksByPriority, recentTasks, recentFailures, upcomingTasks } = data;

  const kpiCards = [
    { label: "MTBF",          value: kpis.mtbf,                   unit: "h",  color: "text-ice",    border: "border-ice/20"    },
    { label: "MTTR",          value: kpis.mttr,                   unit: "h",  color: "text-warn",   border: "border-warn/20"   },
    { label: isFa ? "دسترس‌پذیری" : "Availability",
                               value: `${kpis.availability}%`,              color: kpis.availability >= 95 ? "text-signal" : "text-danger", border: kpis.availability >= 95 ? "border-signal/20" : "border-danger/20" },
    { label: isFa ? "تطابق PM" : "PM Compliance",
                               value: `${kpis.maintenanceCompliance}%`,     color: kpis.maintenanceCompliance >= 90 ? "text-signal" : "text-warn", border: "border-warn/20" },
    { label: isFa ? "معوقه" : "Overdue",
                               value: kpis.overdueCount,                    color: kpis.overdueCount > 0 ? "text-danger" : "text-signal",  border: kpis.overdueCount > 0 ? "border-danger/20" : "border-line" },
    { label: isFa ? "اضطراری" : "Emergency %",
                               value: `${kpis.emergencyWorkPct}%`,          color: kpis.emergencyWorkPct > 10 ? "text-danger" : "text-signal", border: "border-line" },
    { label: isFa ? "بهره تکنیسین" : "Tech Util.",
                               value: `${kpis.technicianUtilization}%`,     color: "text-ice",    border: "border-ice/20"    },
    { label: isFa ? "توقف (ساعت)" : "Downtime h",
                               value: kpis.totalDowntimeHours,              color: "text-warn",   border: "border-warn/20"   },
    { label: isFa ? "خرابی‌ها (30 روز)" : "Failures 30d",
                               value: kpis.failureCount,                    color: kpis.failureCount > 3 ? "text-danger" : "text-signal", border: "border-line" },
    { label: isFa ? "تکمیل‌شده (30 روز)" : "Completed 30d",
                               value: kpis.completedThisMonth,              color: "text-signal", border: "border-signal/20"  },
    { label: isFa ? "زمان‌بندی‌شده (30 روز)" : "Scheduled 30d",
                               value: kpis.scheduledThisMonth,              color: "text-ice",    border: "border-ice/20"    },
  ];

  return (
    <div className="space-y-6">
      {/* Module hero */}
      <div className="rounded-xl border border-warn/15 bg-warn/[0.04] px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow-mono text-warn mb-1">{isFa ? "سیستم مدیریت نگهداشت" : "Computerized Maintenance Management System"}</p>
          <h1 className="text-xl font-bold text-ink">{isFa ? "داشبورد CMMS" : "CMMS Dashboard"}</h1>
          <p className="text-sm text-muted mt-1">
            {isFa ? "نظارت بر KPIهای نگهداشت، دستورکارها و تاریخچه خرابی‌ها" : "Monitor maintenance KPIs, work orders, and failure history"}
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-warn/20 bg-warn/[0.06] text-xs font-medium text-warn">
            <span className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />
            {isFa ? "فقط نظارت — بدون کنترل" : "Monitor Only — No Control"}
          </span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {kpiCards.map(k => (
          <div key={k.label} className={`card-enterprise card-hover rounded-xl p-4 border-s-2 ${k.border}`}>
            <div className={`text-2xl font-bold font-mono ${k.color}`}>{k.value}{k.unit && <span className="text-xs font-normal text-faint ms-1">{k.unit}</span>}</div>
            <div className="text-xs text-muted mt-1 leading-snug">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Status / Priority / Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* By Status */}
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{isFa ? "وضعیت دستورکارها" : "Tasks by Status"}</h3>
          </div>
          <div className="px-5 py-4 space-y-2">
            {Object.entries(tasksByStatus).map(([status, count]) => {
              const s = STATUS_STYLE[status] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
              return (
                <div key={status} className="flex items-center justify-between">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-white/[0.05] ${s.bg} ${s.text}`}>
                    {status.replace(/_/g, " ")}
                  </span>
                  <span className="font-bold text-sm font-mono text-ink">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Priority */}
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{isFa ? "اولویت دستورکارها" : "Tasks by Priority"}</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            {Object.entries(tasksByPriority).map(([pri, count]) => (
              <div key={pri} className="flex items-center justify-between">
                <span className={`text-sm font-medium ${PRIORITY_STYLE[pri] ?? "text-muted"}`}>{pri}</span>
                <span className="font-bold text-sm font-mono text-ink">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{isFa ? "زمان‌بندی‌های آتی" : "Upcoming Scheduled"}</h3>
          </div>
          <div className="divide-y divide-line">
            {upcomingTasks.length === 0 ? (
              <div className="px-5 py-6 text-center"><p className="text-xs text-faint">{isFa ? "دستورکار آتی‌ای یافت نشد" : "No upcoming tasks"}</p></div>
            ) : (
              upcomingTasks.map(t => (
                <div key={t.id} className="px-5 py-3 border-s-2 border-warn/40 ms-5 hover:bg-surface2 transition-colors">
                  <p className="text-sm font-medium text-ink truncate">{t.title}</p>
                  <p className="text-xs text-faint mt-0.5">
                    {t.scheduledDate ? new Date(t.scheduledDate).toLocaleDateString() : "—"} · {t.maintenanceType}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent work orders + failures */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Work Orders */}
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{isFa ? "آخرین دستورکارها" : "Recent Work Orders"}</h3>
            <span className="text-xs text-faint">{recentTasks.length}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface2">
                <th className="text-start px-4 py-2.5 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "عنوان" : "Title"}</th>
                <th className="text-start px-4 py-2.5 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "وضعیت" : "Status"}</th>
                <th className="text-start px-4 py-2.5 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "اولویت" : "Pri."}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recentTasks.map(t => {
                const s = STATUS_STYLE[t.status] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
                return (
                  <tr key={t.id} className="hover:bg-surface2 transition-colors">
                    <td className="px-4 py-2.5 max-w-[180px]">
                      <p className="text-sm font-medium text-ink truncate">{t.title}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded border border-white/[0.05] ${s.bg} ${s.text}`}>
                        {t.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-xs font-bold ${PRIORITY_STYLE[t.priority] ?? "text-muted"}`}>
                      {t.priority}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Recent Failures */}
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{isFa ? "آخرین خرابی‌ها" : "Recent Failures"}</h3>
            <span className="text-xs text-faint">{recentFailures.length}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface2">
                <th className="text-start px-4 py-2.5 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "عنوان" : "Title"}</th>
                <th className="text-start px-4 py-2.5 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "شدت" : "Severity"}</th>
                <th className="text-start px-4 py-2.5 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "تاریخ" : "Date"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recentFailures.map(f => (
                <tr key={f.id} className="hover:bg-surface2 transition-colors">
                  <td className="px-4 py-2.5 max-w-[180px]">
                    <p className="text-sm font-medium text-ink truncate">{f.title}</p>
                  </td>
                  <td className={`px-4 py-2.5 text-xs font-bold ${SEV_STYLE[f.severity] ?? "text-muted"}`}>
                    {f.severity}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-faint font-mono">
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
