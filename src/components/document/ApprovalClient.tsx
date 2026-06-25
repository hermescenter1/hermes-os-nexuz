"use client";
import { useState } from "react";
import type { EdmsApproval } from "@/lib/document/types";

const STATUS_BADGE: Record<string, string> = {
  PENDING:  "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

interface Props { approvals: EdmsApproval[] }

export function ApprovalClient({ approvals }: Props) {
  const [list, setList]         = useState(approvals);
  const [loading, setLoading]   = useState<string | null>(null);

  async function decide(id: string, documentId: string, status: "APPROVED" | "REJECTED") {
    setLoading(id);
    try {
      const res = await fetch(`/api/edms/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, documentId }),
      });
      if (res.ok) {
        const updated: EdmsApproval = await res.json();
        setList(prev => prev.map(a => a.id === id ? updated : a));
      }
    } finally {
      setLoading(null);
    }
  }

  if (list.length === 0) {
    return <p className="text-sm text-text-muted py-8 text-center">No approval records found.</p>;
  }

  return (
    <div className="space-y-3">
      {list.map(apr => (
        <div key={apr.id} className="bg-surface-1 rounded-xl p-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium text-text-primary">Stage {apr.stage} — {apr.approverRole}</p>
            <p className="text-xs text-text-muted mt-0.5">
              Document: <span className="font-mono">{apr.documentId.slice(0, 8)}…</span>
              {apr.dueDate && <> · Due: {new Date(apr.dueDate).toLocaleDateString()}</>}
            </p>
            {apr.comment && <p className="text-xs text-text-secondary mt-1 italic">{apr.comment}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[apr.status] ?? "bg-gray-100 text-gray-700"}`}>
              {apr.status}
            </span>
            {apr.status === "PENDING" && (
              <>
                <button
                  onClick={() => decide(apr.id, apr.documentId, "APPROVED")}
                  disabled={loading === apr.id}
                  className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide(apr.id, apr.documentId, "REJECTED")}
                  disabled={loading === apr.id}
                  className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
