"use client";

import { useLocale } from "next-intl";import { useState } from "react";
import { usePathname } from "next/navigation";
import type { EdmsApproval } from "@/lib/document/types";
import { formatDate } from "@/lib/i18n/format";

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  PENDING:  { bg: "bg-warn/[0.08]",   text: "text-warn",   dot: "bg-warn"   },
  APPROVED: { bg: "bg-signal/[0.08]", text: "text-signal", dot: "bg-signal" },
  REJECTED: { bg: "bg-danger/[0.08]", text: "text-danger", dot: "bg-danger" },
};

interface Props { approvals: EdmsApproval[] }

export function ApprovalClient({ approvals }: Props) {
  const locale = useLocale();
  const [list, setList]         = useState(approvals);
  const [loading, setLoading]   = useState<string | null>(null);
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");

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
    return (
      <div className="card-enterprise rounded-xl px-5 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-signal/[0.08] border border-signal/15 flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-signal"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/></svg>
        </div>
        <p className="text-ink font-medium mb-1">{isFa ? "هیچ تأییدیه‌ای یافت نشد" : "No approvals found"}</p>
        <p className="text-muted text-sm">{isFa ? "همه تأییدیه‌ها پردازش شده‌اند" : "All approvals have been processed"}</p>
      </div>
    );
  }

  const pending  = list.filter(a => a.status === "PENDING").length;
  const approved = list.filter(a => a.status === "APPROVED").length;
  const rejected = list.filter(a => a.status === "REJECTED").length;

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: isFa ? "در انتظار" : "Pending",  value: pending,  ac: "text-warn",   b: "border-s-2 border-warn/40" },
          { label: isFa ? "تأیید شده" : "Approved", value: approved, ac: "text-signal", b: "border-s-2 border-signal/40" },
          { label: isFa ? "رد شده"    : "Rejected", value: rejected, ac: "text-danger",  b: "border-s-2 border-danger/40" },
        ].map(s => (
          <div key={s.label} className={`card-enterprise rounded-xl p-4 ${s.b}`}>
            <div className={`text-2xl font-bold font-mono ${s.ac}`}>{s.value}</div>
            <div className="text-xs text-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Approval list */}
      <div className="space-y-2">
        {list.map(apr => {
          const s = STATUS_STYLE[apr.status] ?? { bg: "bg-muted/[0.06]", text: "text-muted", dot: "bg-muted" };
          return (
            <div key={apr.id} className="card-enterprise card-hover rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/[0.06] text-xs font-medium ${s.bg} ${s.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {apr.status}
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      {isFa ? "مرحله" : "Stage"} {apr.stage} — {apr.approverRole}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-faint">
                    <span>{isFa ? "سند" : "Document"}: <span className="font-mono text-muted">{apr.documentId.slice(0, 8)}…</span></span>
                    {apr.dueDate && (
                      <span>{isFa ? "موعد" : "Due"}: <span className="text-muted">{formatDate(apr.dueDate, locale)}</span></span>
                    )}
                  </div>
                  {apr.comment && (
                    <p className="text-xs text-muted mt-2 italic border-s-2 border-signal/20 ps-3">
                      {apr.comment}
                    </p>
                  )}
                </div>

                {apr.status === "PENDING" && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => decide(apr.id, apr.documentId, "APPROVED")}
                      disabled={loading === apr.id}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium bg-signal/[0.10] text-signal border border-signal/25 hover:bg-signal/[0.18] disabled:opacity-40 transition-colors"
                    >
                      {loading === apr.id ? "…" : (isFa ? "تأیید" : "Approve")}
                    </button>
                    <button
                      onClick={() => decide(apr.id, apr.documentId, "REJECTED")}
                      disabled={loading === apr.id}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium bg-danger/[0.10] text-danger border border-danger/25 hover:bg-danger/[0.18] disabled:opacity-40 transition-colors"
                    >
                      {loading === apr.id ? "…" : (isFa ? "رد" : "Reject")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
