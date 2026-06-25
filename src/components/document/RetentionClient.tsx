"use client";
import type { EdmsRetentionPolicy } from "@/lib/document/types";
import type { RetentionCheckResult } from "@/lib/document/retention";

const ACTION_BADGE: Record<string, string> = {
  keep:    "bg-green-100 text-green-700",
  archive: "bg-yellow-100 text-yellow-700",
  delete:  "bg-red-100 text-red-700",
};

interface Props {
  policies: EdmsRetentionPolicy[];
  checks:   RetentionCheckResult[];
}

export function RetentionClient({ policies, checks }: Props) {
  const toAction = checks.filter(c => c.action !== "keep");
  return (
    <div className="space-y-6">
      <div className="bg-surface-1 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-secondary mb-3">Retention Policies ({policies.length})</h3>
        <div className="space-y-2">
          {policies.map(p => (
            <div key={p.id} className="flex items-start justify-between border-b border-surface-2 last:border-0 py-2">
              <div>
                <p className="text-sm font-medium text-text-primary">{p.name}</p>
                {p.description && <p className="text-xs text-text-muted">{p.description}</p>}
                <p className="text-xs text-text-secondary mt-0.5">
                  {p.retentionDays} days · {p.documentType ?? "All types"}
                  {p.autoArchive && " · Auto-archive"}
                  {p.autoDelete  && " · Auto-delete"}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                {p.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
          {policies.length === 0 && <p className="text-xs text-text-muted">No retention policies defined.</p>}
        </div>
      </div>

      {toAction.length > 0 && (
        <div className="bg-surface-1 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Documents Requiring Action ({toAction.length})</h3>
          <div className="space-y-2">
            {toAction.map(c => (
              <div key={c.documentId} className="flex items-center justify-between border-b border-surface-2 last:border-0 py-2">
                <div>
                  <p className="text-sm font-medium text-text-primary">{c.title}</p>
                  <p className="text-xs text-text-muted">{c.ageInDays} days old · Policy: {c.policyName ?? "—"}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_BADGE[c.action] ?? "bg-gray-100 text-gray-700"}`}>
                  {c.action}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
