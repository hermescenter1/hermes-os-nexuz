"use client";

import type { MaintenanceTechnician, MaintenanceTeam, MaintenanceWorkCenter } from "@/lib/cmms/types";

export function SettingsClient({
  technicians, teams, workCenters,
}: {
  technicians: MaintenanceTechnician[];
  teams:       MaintenanceTeam[];
  workCenters: MaintenanceWorkCenter[];
}) {
  return (
    <div className="space-y-8">
      {/* Work Centers */}
      <section>
        <h2 className="text-base font-semibold mb-4">Work Centers ({workCenters.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {workCenters.map(wc => (
            <div key={wc.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-primary">{wc.code}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${wc.isActive ? "bg-green-500/15 text-green-400" : "bg-slate-500/15 text-slate-400"}`}>
                  {wc.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <h3 className="font-semibold text-sm">{wc.name}</h3>
              {wc.location && <p className="text-xs text-muted-foreground mt-1">{wc.location}</p>}
              {wc.costCenter && <p className="text-xs text-muted-foreground">CC: {wc.costCenter}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Teams */}
      <section>
        <h2 className="text-base font-semibold mb-4">Maintenance Teams ({teams.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map(t => (
            <div key={t.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-sm">{t.name}</h3>
                <span className="text-xs text-muted-foreground">Cap: {t.capacity}</span>
              </div>
              {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
              {t.specialty && <p className="text-xs mt-1"><span className="text-muted-foreground">Specialty:</span> {t.specialty}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Technicians */}
      <section>
        <h2 className="text-base font-semibold mb-4">Technicians ({technicians.length})</h2>
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-muted-foreground">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Employee ID</th>
                <th className="text-left px-4 py-3">Specialty</th>
                <th className="text-left px-4 py-3">Team</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Certifications</th>
              </tr>
            </thead>
            <tbody>
              {technicians.map(t => (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{t.employeeId ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{t.specialty ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{t.teamId ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${t.isAvailable ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"}`}>
                      {t.isAvailable ? "Available" : "Assigned"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {t.certifications.slice(0, 2).join(", ")}{t.certifications.length > 2 ? ` +${t.certifications.length - 2}` : ""}
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
