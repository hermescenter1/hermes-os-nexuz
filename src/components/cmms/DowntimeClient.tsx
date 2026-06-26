"use client";
import { usePathname } from "next/navigation";
import type { MaintenanceDowntime } from "@/lib/cmms/types";

const REASON_STYLE: Record<string, { bg: string; text: string }> = {
  PLANNED_MAINTENANCE: { bg: "bg-ice/[0.08]",    text: "text-ice"    },
  BREAKDOWN:           { bg: "bg-danger/[0.10]", text: "text-danger" },
  SETUP:               { bg: "bg-muted/[0.08]",  text: "text-muted"  },
  WAITING_PARTS:       { bg: "bg-warn/[0.08]",   text: "text-warn"   },
  WAITING_APPROVAL:    { bg: "bg-warn/[0.10]",   text: "text-warn"   },
  EXTERNAL:            { bg: "bg-faint/[0.08]",  text: "text-faint"  },
  UNKNOWN:             { bg: "bg-faint/[0.06]",  text: "text-faint"  },
};

export function DowntimeClient({ downtime }: { downtime: MaintenanceDowntime[] }) {
  const pathname       = usePathname();
  const isFa           = pathname.startsWith("/fa");
  const totalMinutes   = downtime.reduce((s, d) => s + (d.durationMinutes ?? 0), 0);
  const unplannedMin   = downtime.filter(d => d.reason !== "PLANNED_MAINTENANCE").reduce((s, d) => s + (d.durationMinutes ?? 0), 0);
  const totalLoss      = downtime.reduce((s, d) => s + (d.productionLoss ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: isFa ? "کل توقف"        : "Total Downtime",  value: `${Math.round(totalMinutes / 60)}h`,  ac: "text-ink",    b: "border-line"     },
          { label: isFa ? "غیربرنامه‌ریزی" : "Unplanned",       value: `${Math.round(unplannedMin / 60)}h`, ac: "text-danger", b: "border-danger/30" },
          { label: isFa ? "رویدادها"        : "Events",          value: downtime.length,                      ac: "text-warn",   b: "border-warn/30"   },
          { label: isFa ? "زیان تولید"      : "Production Loss", value: `$${Math.round(totalLoss).toLocaleString()}`, ac: "text-warn", b: "border-warn/20" },
        ].map(s => (
          <div key={s.label} className={`card-enterprise rounded-xl p-4 border-s-2 ${s.b}`}>
            <div className={`text-2xl font-bold font-mono ${s.ac}`}>{s.value}</div>
            <div className="text-xs text-muted mt-1.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card-enterprise rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface2">
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "دستگاه" : "Asset"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "دلیل" : "Reason"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{isFa ? "شروع" : "Started"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "مدت" : "Duration"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{isFa ? "تأثیر" : "Impact"}</th>
              <th className="text-end px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{isFa ? "زیان ($)" : "Loss ($)"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {downtime.map(d => {
              const r = REASON_STYLE[d.reason] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
              return (
                <tr key={d.id} className="hover:bg-surface2 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-faint">{d.assetId ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-white/[0.05] ${r.bg} ${r.text}`}>
                      {d.reason.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-faint font-mono">{new Date(d.startedAt).toLocaleDateString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono font-medium text-warn">
                      {d.durationMinutes != null
                        ? `${Math.round(d.durationMinutes / 60)}h ${d.durationMinutes % 60}m`
                        : (isFa ? "در حال اجرا" : "Ongoing")}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell max-w-[200px]">
                    <span className="text-xs text-muted truncate block">{d.impact ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-end">
                    <span className={`text-xs font-mono font-medium ${d.productionLoss ? "text-warn" : "text-faint"}`}>
                      {d.productionLoss ? `$${d.productionLoss.toLocaleString()}` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
