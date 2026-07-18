"use client";
import { useTranslations } from "next-intl";
import { enumLabel } from "@/lib/i18n/enum-label";
import type { MaintenanceSchedule } from "@/lib/cmms/types";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  PLANNED:     { bg: "bg-ice/[0.08]",    text: "text-ice"    },
  SCHEDULED:   { bg: "bg-signal/[0.08]", text: "text-signal" },
  IN_PROGRESS: { bg: "bg-warn/[0.10]",   text: "text-warn"   },
  COMPLETED:   { bg: "bg-signal/[0.08]", text: "text-signal" },
  OVERDUE:     { bg: "bg-danger/[0.10]", text: "text-danger" },
  CANCELLED:   { bg: "bg-faint/[0.06]",  text: "text-faint"  },
};

const PRIORITY_COLOR: Record<string, string> = {
  LOW:       "text-signal",
  MEDIUM:    "text-warn",
  HIGH:      "text-warn",
  CRITICAL:  "text-danger",
  EMERGENCY: "text-danger",
};

export function SchedulesClient({ schedules }: { schedules: MaintenanceSchedule[] }) {
  const t = useTranslations("maintenanceOperations");
  const tAm = useTranslations("assetMaintenance"); // 87L.5: localized status labels

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-ink">{t("schedules.heading")}</h2>
        <span className="text-xs text-faint font-mono">({schedules.length})</span>
      </div>

      <div className="card-enterprise rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface2">
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{t("schedules.colName")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{t("schedules.colStatus")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{t("schedules.colPriority")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{t("schedules.colDate")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{t("schedules.colHours")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{t("schedules.colTechnician")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden xl:table-cell">{t("schedules.colAsset")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {schedules.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-muted text-sm">
                  {t("schedules.empty")}
                </td>
              </tr>
            ) : (
              schedules.map(s => {
                const st = STATUS_STYLE[s.status] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
                return (
                  <tr key={s.id} className="hover:bg-surface2 transition-colors">
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="font-medium text-ink truncate">{s.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-white/[0.05] ${st.bg} ${st.text}`}>
                        {enumLabel(tAm, "maintenanceStatus", s.status)}
                      </span>
                    </td>
                    <td className={`px-4 py-3 hidden md:table-cell text-xs font-bold ${PRIORITY_COLOR[s.priority] ?? "text-muted"}`}>
                      {s.priority}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-faint font-mono">
                        {new Date(s.scheduledDate).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs font-mono text-muted">{s.estimatedHours}h</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-muted">{s.technicianId ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs font-mono text-faint">{s.assetId ?? "—"}</span>
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
