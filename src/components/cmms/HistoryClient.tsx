"use client";

import type { MaintenanceHistory } from "@/lib/cmms/types";

const ACTION_ICON: Record<string, string> = {
  TASK_CREATED:     "📋",
  TASK_STARTED:     "▶️",
  TASK_COMPLETED:   "✅",
  TASK_CANCELLED:   "❌",
  APPROVAL_GRANTED: "✔️",
  APPROVAL_PENDING: "⏳",
  TASK_APPROVED:    "👍",
  STATUS_CHANGED:   "🔄",
  COMMENT_ADDED:    "💬",
};

export function HistoryClient({ history }: { history: MaintenanceHistory[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Maintenance Audit Trail <span className="text-muted-foreground text-sm">({history.length} events)</span></h2>

      <div className="relative">
        <div className="absolute left-5 top-0 bottom-0 w-px bg-white/10" />
        <div className="space-y-4">
          {history.map(h => (
            <div key={h.id} className="flex gap-4 relative">
              <div className="w-10 h-10 rounded-full border border-white/10 bg-card flex items-center justify-center text-sm shrink-0 z-10">
                {ACTION_ICON[h.action] ?? "📝"}
              </div>
              <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{h.action.replace(/_/g, " ")}</p>
                    {h.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{h.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleTimeString()}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">WO: {h.taskId}</span>
                  {h.userId && <span>by {h.userId}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
