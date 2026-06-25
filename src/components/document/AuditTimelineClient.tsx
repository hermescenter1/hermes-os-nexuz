"use client";
import type { EdmsAudit } from "@/lib/document/types";

const ACTION_COLORS: Record<string, string> = {
  CREATE:   "bg-green-500",
  UPDATE:   "bg-blue-500",
  DELETE:   "bg-red-500",
  APPROVE:  "bg-emerald-500",
  REJECT:   "bg-rose-500",
  CHECKOUT: "bg-purple-500",
  CHECKIN:  "bg-indigo-500",
  VIEW:     "bg-gray-400",
};

interface Props { entries: EdmsAudit[] }

export function AuditTimelineClient({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="text-sm text-text-muted py-8 text-center">No audit entries found.</p>;
  }
  return (
    <div className="relative border-l-2 border-surface-2 ml-3 space-y-0">
      {entries.map(entry => (
        <div key={entry.id} className="relative pl-6 pb-5">
          <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full ${ACTION_COLORS[entry.action] ?? "bg-gray-400"}`} />
          <div className="bg-surface-1 rounded-lg p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-semibold text-text-primary">{entry.action}</span>
              {entry.details && <span className="text-xs text-text-secondary">{entry.details}</span>}
            </div>
            <div className="mt-1 flex gap-3 text-xs text-text-muted">
              <span>Doc: <span className="font-mono">{entry.documentId.slice(0, 8)}…</span></span>
              <span>{new Date(entry.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
