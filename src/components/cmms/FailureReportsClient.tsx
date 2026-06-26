"use client";

import type { MaintenanceFailure } from "@/lib/cmms/types";

const SEV_STYLE: Record<string, string> = {
  MINOR:    "bg-green-500/15 text-green-400",
  MODERATE: "bg-yellow-500/15 text-yellow-400",
  MAJOR:    "bg-orange-500/15 text-orange-400",
  CRITICAL: "bg-red-500/15 text-red-400",
};

const CAT_ICON: Record<string, string> = {
  MECHANICAL:       "⚙️",
  ELECTRICAL:       "⚡",
  INSTRUMENTATION:  "📡",
  SOFTWARE:         "💻",
  HYDRAULIC:        "💧",
  PNEUMATIC:        "💨",
  STRUCTURAL:       "🏗️",
  OPERATIONAL:      "📋",
};

export function FailureReportsClient({ failures }: { failures: MaintenanceFailure[] }) {
  const resolvedCount  = failures.filter(f => f.resolvedAt).length;
  const criticalCount  = failures.filter(f => f.severity === "CRITICAL").length;
  const totalDowntime  = failures.reduce((s, f) => s + (f.downtimeMinutes ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{failures.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Failures</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{criticalCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Critical</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{resolvedCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Resolved</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{Math.round(totalDowntime / 60)}h</div>
          <div className="text-xs text-muted-foreground mt-1">Total Downtime</div>
        </div>
      </div>

      {/* Failure list */}
      <div className="space-y-4">
        {failures.map(f => (
          <div key={f.id} className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{CAT_ICON[f.category] ?? "❓"}</span>
                <h3 className="font-semibold">{f.title}</h3>
              </div>
              <div className="flex gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEV_STYLE[f.severity] ?? ""}`}>
                  {f.severity}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs ${f.resolvedAt ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                  {f.resolvedAt ? "Resolved" : "Open"}
                </span>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{f.description}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground mb-4">
              <div><span className="font-medium text-foreground">Category:</span> {f.category}</div>
              <div><span className="font-medium text-foreground">Occurred:</span> {new Date(f.occurredAt).toLocaleDateString()}</div>
              {f.resolvedAt && <div><span className="font-medium text-foreground">Resolved:</span> {new Date(f.resolvedAt).toLocaleDateString()}</div>}
              {f.downtimeMinutes != null && <div><span className="font-medium text-foreground">Downtime:</span> {Math.round(f.downtimeMinutes / 60)}h</div>}
            </div>

            {f.causes && f.causes.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Root Causes</p>
                <ul className="space-y-1">
                  {f.causes.map(c => (
                    <li key={c.id} className="text-xs flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.isConfirmed ? "bg-orange-400" : "bg-slate-500"}`} />
                      <span className="text-muted-foreground">{c.cause}</span>
                      <span className="text-slate-500">({Math.round(c.probability * 100)}%)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {f.correctiveActions && f.correctiveActions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Corrective Actions</p>
                <ul className="space-y-1">
                  {f.correctiveActions.map(ca => (
                    <li key={ca.id} className="text-xs flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded ${ca.status === "CLOSED" ? "bg-green-500/15 text-green-400" : ca.status === "IN_PROGRESS" ? "bg-yellow-500/15 text-yellow-400" : "bg-blue-500/15 text-blue-400"}`}>
                        {ca.status}
                      </span>
                      <span className="text-muted-foreground">{ca.action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
