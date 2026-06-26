"use client";
import { usePathname } from "next/navigation";
import type { MaintenanceHistory } from "@/lib/cmms/types";

const ACTION_COLOR: Record<string, string> = {
  TASK_CREATED:     "text-signal",
  TASK_STARTED:     "text-ice",
  TASK_COMPLETED:   "text-signal",
  TASK_CANCELLED:   "text-danger",
  APPROVAL_GRANTED: "text-signal",
  APPROVAL_PENDING: "text-warn",
  TASK_APPROVED:    "text-signal",
  STATUS_CHANGED:   "text-ice",
  COMMENT_ADDED:    "text-muted",
};

const ACTION_DOT: Record<string, string> = {
  TASK_CREATED:     "bg-signal",
  TASK_STARTED:     "bg-ice",
  TASK_COMPLETED:   "bg-signal",
  TASK_CANCELLED:   "bg-danger",
  APPROVAL_GRANTED: "bg-signal",
  APPROVAL_PENDING: "bg-warn",
  TASK_APPROVED:    "bg-signal",
  STATUS_CHANGED:   "bg-ice",
  COMMENT_ADDED:    "bg-muted",
};

export function HistoryClient({ history }: { history: MaintenanceHistory[] }) {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-ink">{isFa ? "مسیر حسابرسی نگهداشت" : "Maintenance Audit Trail"}</h2>
        <span className="text-xs text-faint font-mono">({history.length} {isFa ? "رویداد" : "events"})</span>
      </div>

      <div className="relative">
        {/* Vertical timeline line */}
        <div className="absolute start-[11px] top-5 bottom-5 w-px bg-line" aria-hidden />

        <div className="space-y-3">
          {history.map(h => {
            const color = ACTION_COLOR[h.action] ?? "text-muted";
            const dot   = ACTION_DOT[h.action]   ?? "bg-muted";
            return (
              <div key={h.id} className="flex gap-4 relative">
                {/* Dot */}
                <div className={`relative z-10 w-6 h-6 rounded-full border-2 border-surface flex items-center justify-center shrink-0 mt-0.5 ${dot}`} />

                {/* Card */}
                <div className="flex-1 card-enterprise rounded-xl p-4 mb-1">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className={`text-sm font-semibold ${color}`}>
                        {h.action.replace(/_/g, " ")}
                      </p>
                      {h.description && (
                        <p className="text-xs text-muted mt-0.5">{h.description}</p>
                      )}
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-xs font-mono text-faint">{new Date(h.createdAt).toLocaleDateString()}</p>
                      <p className="text-xs font-mono text-faint">{new Date(h.createdAt).toLocaleTimeString()}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-faint">
                    <span className="font-mono">{isFa ? "دستورکار" : "WO"}: {h.taskId.slice(0, 8)}…</span>
                    {h.userId && <span>{isFa ? "توسط" : "by"}: {h.userId}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
