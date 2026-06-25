"use client";
import type { EdmsDocumentFull } from "@/lib/document/types";

const STATUS_BADGE: Record<string, string> = {
  DRAFT:    "bg-yellow-100 text-yellow-800",
  REVIEW:   "bg-blue-100 text-blue-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  ARCHIVED: "bg-gray-100 text-gray-700",
  OBSOLETE: "bg-purple-100 text-purple-800",
};

const APPROVAL_BADGE: Record<string, string> = {
  PENDING:  "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

interface Props { document: EdmsDocumentFull }

export function DocumentDetailClient({ document: doc }: Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-surface-1 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-text-primary">{doc.title}</h2>
            {doc.description && <p className="text-sm text-text-muted mt-1">{doc.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            {doc.isLocked && (
              <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-medium">Locked</span>
            )}
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_BADGE[doc.status] ?? "bg-gray-100 text-gray-700"}`}>
              {doc.status}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><dt className="text-text-muted text-xs">Type</dt><dd className="text-text-primary font-medium">{doc.documentType.replace(/_/g, " ")}</dd></div>
          <div><dt className="text-text-muted text-xs">Current Revision</dt><dd className="text-text-primary font-mono font-medium">{doc.currentRevision ?? "—"}</dd></div>
          <div><dt className="text-text-muted text-xs">Language</dt><dd className="text-text-primary font-medium uppercase">{doc.language}</dd></div>
          <div><dt className="text-text-muted text-xs">Updated</dt><dd className="text-text-primary font-medium">{new Date(doc.updatedAt).toLocaleDateString()}</dd></div>
        </dl>

        {doc.keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {doc.keywords.map(kw => (
              <span key={kw} className="text-xs bg-surface-2 text-text-secondary px-2 py-0.5 rounded-full">{kw}</span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revisions */}
        <div className="bg-surface-1 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Revision History ({doc.revisions.length})</h3>
          <div className="space-y-2">
            {doc.revisions.slice(0, 6).map(rev => (
              <div key={rev.id} className="flex justify-between items-start border-b border-surface-2 last:border-0 pb-2">
                <div>
                  <span className="font-mono text-xs text-brand font-semibold">{rev.revisionNumber}</span>
                  <span className="ml-2 text-xs text-text-muted">{rev.revisionType}</span>
                  {rev.summary && <p className="text-xs text-text-secondary mt-0.5">{rev.summary}</p>}
                </div>
                <span className="text-xs text-text-muted">{new Date(rev.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
            {doc.revisions.length === 0 && <p className="text-xs text-text-muted">No revisions yet.</p>}
          </div>
        </div>

        {/* Approvals */}
        <div className="bg-surface-1 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Approvals ({doc.approvals.length})</h3>
          <div className="space-y-2">
            {doc.approvals.slice(0, 6).map(apr => (
              <div key={apr.id} className="flex justify-between items-center border-b border-surface-2 last:border-0 pb-2">
                <div>
                  <p className="text-xs text-text-primary font-medium">Stage {apr.stage} — {apr.approverRole}</p>
                  {apr.comment && <p className="text-xs text-text-muted mt-0.5">{apr.comment}</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${APPROVAL_BADGE[apr.status] ?? "bg-gray-100 text-gray-700"}`}>
                  {apr.status}
                </span>
              </div>
            ))}
            {doc.approvals.length === 0 && <p className="text-xs text-text-muted">No approvals yet.</p>}
          </div>
        </div>

        {/* Comments */}
        <div className="bg-surface-1 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Comments ({doc.comments.length})</h3>
          <div className="space-y-2">
            {doc.comments.slice(0, 5).map(cmt => (
              <div key={cmt.id} className="border-b border-surface-2 last:border-0 pb-2">
                <p className="text-xs text-text-primary">{cmt.content}</p>
                <p className="text-xs text-text-muted mt-0.5">{new Date(cmt.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {doc.comments.length === 0 && <p className="text-xs text-text-muted">No comments yet.</p>}
          </div>
        </div>

        {/* Metadata */}
        <div className="bg-surface-1 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Metadata ({doc.metadata.length} entries)</h3>
          <dl className="space-y-1.5">
            {doc.metadata.slice(0, 8).map(m => (
              <div key={m.id} className="flex gap-2 text-xs">
                <dt className="text-text-muted min-w-[100px]">{m.key}</dt>
                <dd className="text-text-primary font-medium">{m.value}</dd>
              </div>
            ))}
            {doc.metadata.length === 0 && <p className="text-xs text-text-muted">No metadata.</p>}
          </dl>
        </div>
      </div>

      {/* Audit */}
      {doc.audit.length > 0 && (
        <div className="bg-surface-1 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Audit Trail (recent {doc.audit.length})</h3>
          <div className="space-y-1">
            {doc.audit.map(a => (
              <div key={a.id} className="flex items-start gap-2 text-xs border-b border-surface-2 last:border-0 py-1.5">
                <span className="bg-brand/10 text-brand px-1.5 py-0.5 rounded font-mono">{a.action}</span>
                <span className="text-text-secondary">{a.details ?? a.action}</span>
                <span className="ml-auto text-text-muted whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
