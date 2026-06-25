"use client";
import type { EdmsDashboard } from "@/lib/document/types";

interface Props { dashboard: EdmsDashboard }

const STATUS_COLORS: Record<string, string> = {
  DRAFT:    "bg-yellow-100 text-yellow-800",
  REVIEW:   "bg-blue-100 text-blue-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  ARCHIVED: "bg-gray-100 text-gray-800",
  OBSOLETE: "bg-purple-100 text-purple-800",
};

export function DocumentDashboardClient({ dashboard }: Props) {
  const kpis = [
    { label: "Total Documents",    value: dashboard.totalDocuments,   color: "border-brand" },
    { label: "Drafts",             value: dashboard.draftCount,       color: "border-yellow-500" },
    { label: "In Review",          value: dashboard.reviewCount,      color: "border-blue-500" },
    { label: "Approved",           value: dashboard.approvedCount,    color: "border-green-500" },
    { label: "Pending Approvals",  value: dashboard.pendingApprovals, color: "border-orange-500" },
    { label: "Active Checkouts",   value: dashboard.activeCheckouts,  color: "border-purple-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`bg-surface-1 rounded-xl p-4 border-l-4 ${k.color}`}>
            <p className="text-2xl font-bold text-text-primary">{k.value}</p>
            <p className="text-xs text-text-muted mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-1 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Recent Documents</h3>
          <div className="space-y-2">
            {dashboard.recentDocuments.map(doc => (
              <div key={doc.id} className="flex items-center justify-between py-1.5 border-b border-surface-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-text-primary truncate max-w-[260px]">{doc.title}</p>
                  <p className="text-xs text-text-muted">{doc.documentType.replace(/_/g, " ")}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[doc.status] ?? "bg-gray-100 text-gray-700"}`}>
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-1 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Recent Audit Activity</h3>
          <div className="space-y-2">
            {dashboard.recentAudit.map(entry => (
              <div key={entry.id} className="flex items-start gap-2 py-1.5 border-b border-surface-2 last:border-0">
                <span className="text-xs bg-brand/10 text-brand px-1.5 py-0.5 rounded font-mono mt-0.5">{entry.action}</span>
                <div>
                  <p className="text-xs text-text-primary">{entry.details ?? entry.action}</p>
                  <p className="text-xs text-text-muted">{new Date(entry.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-surface-1 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-secondary mb-3">Documents by Type</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(dashboard.documentsByType).map(([type, count]) => (
            <div key={type} className="bg-surface-2 rounded-lg px-3 py-1.5 flex gap-2 items-center">
              <span className="text-sm font-semibold text-text-primary">{count}</span>
              <span className="text-xs text-text-muted">{type.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
