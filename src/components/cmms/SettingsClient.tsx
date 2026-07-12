"use client";
import { useTranslations } from "next-intl";
import type { MaintenanceTechnician, MaintenanceTeam, MaintenanceWorkCenter } from "@/lib/cmms/types";

export function SettingsClient({
  technicians, teams, workCenters,
}: {
  technicians: MaintenanceTechnician[];
  teams:       MaintenanceTeam[];
  workCenters: MaintenanceWorkCenter[];
}) {
  const t = useTranslations("maintenanceOperations");

  return (
    <div className="space-y-7">
      {/* Work Centers */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <p className="eyebrow-label text-faint">{t("settings.workCenters")}</p>
          <span className="text-xs text-faint font-mono">({workCenters.length})</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {workCenters.map(wc => (
            <div key={wc.id} className="card-enterprise card-hover rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-warn">{wc.code}</span>
                <span className={`text-xs px-2 py-0.5 rounded border border-white/[0.05] font-medium ${
                  wc.isActive ? "bg-signal/[0.08] text-signal" : "bg-faint/[0.06] text-faint"
                }`}>
                  {wc.isActive ? t("settings.active") : t("settings.inactive")}
                </span>
              </div>
              <h3 className="font-semibold text-ink text-sm">{wc.name}</h3>
              {wc.location && <p className="text-xs text-muted mt-1">{wc.location}</p>}
              {wc.costCenter && <p className="text-xs text-faint mt-0.5 font-mono">{t("settings.costCenter")}: {wc.costCenter}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Maintenance Teams */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <p className="eyebrow-label text-faint">{t("settings.teams")}</p>
          <span className="text-xs text-faint font-mono">({teams.length})</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {teams.map(team => (
            <div key={team.id} className="card-enterprise card-hover rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-ink text-sm">{team.name}</h3>
                <span className="text-xs text-faint shrink-0">
                  {t("settings.capacity")}: <span className="font-mono text-muted">{team.capacity}</span>
                </span>
              </div>
              {team.description && <p className="text-xs text-muted">{team.description}</p>}
              {team.specialty && (
                <p className="text-xs mt-1.5">
                  <span className="text-faint">{t("settings.specialty")}:</span>
                  <span className="text-muted ms-1">{team.specialty}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Technicians */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <p className="eyebrow-label text-faint">{t("settings.technicians")}</p>
          <span className="text-xs text-faint font-mono">({technicians.length})</span>
        </div>
        <div className="card-enterprise rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface2">
                <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{t("settings.colName")}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{t("settings.colEmployeeId")}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{t("settings.colSpecialty")}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{t("settings.colTeam")}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{t("settings.colStatus")}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden xl:table-cell">{t("settings.colCertifications")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {technicians.map(tech => (
                <tr key={tech.id} className="hover:bg-surface2 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-ink">{tech.name}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs font-mono text-faint">{tech.employeeId ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-muted">{tech.specialty ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-faint font-mono">{tech.teamId?.slice(0, 8) ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded border border-white/[0.05] font-medium ${
                      tech.isAvailable
                        ? "bg-signal/[0.08] text-signal"
                        : "bg-warn/[0.08] text-warn"
                    }`}>
                      {tech.isAvailable ? t("settings.available") : t("settings.assigned")}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="text-xs text-muted">
                      {tech.certifications.slice(0, 2).join(", ")}{tech.certifications.length > 2 ? ` +${tech.certifications.length - 2}` : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
