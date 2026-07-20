"use client";

import { useState }        from "react";
import { useTranslations, useLocale } from "next-intl";
import type { ErpApprovalRequestFull } from "@/lib/erp/types";
import { formatDate } from "@/lib/i18n/format";

const STATUS_COLOR: Record<string, string> = {
  PENDING:   "bg-yellow-500/15 text-yellow-400",
  APPROVED:  "bg-green-500/15 text-green-400",
  REJECTED:  "bg-red-500/15 text-red-400",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function ApprovalListClient({ approvals: initial }: { approvals: ErpApprovalRequestFull[] }) {
  const locale = useLocale();
  const t = useTranslations("enterpriseOperations");
  const [approvals, setApprovals] = useState(initial);

  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    const res = await fetch(`/api/erp/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json() as ErpApprovalRequestFull;
      setApprovals(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
    }
  }

  return (
    <div className="space-y-3">
      {approvals.map(apr => (
        <div key={apr.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{apr.title}</div>
              {apr.description && <div className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{apr.description}</div>}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{formatDate(apr.createdAt, locale)}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[apr.status] ?? ""}`}>
                {t(`approvals.status.${apr.status}`)}
              </span>
              {apr.status === "PENDING" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => decide(apr.id, "APPROVED")}
                    className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                  >{t("approvals.approve")}</button>
                  <button
                    onClick={() => decide(apr.id, "REJECTED")}
                    className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                  >{t("approvals.reject")}</button>
                </div>
              )}
            </div>
          </div>

          {apr.steps && apr.steps.length > 0 && (
            <div className="mt-3 pt-3 border-t flex gap-2 flex-wrap">
              {apr.steps.map(step => (
                <div key={step.id} className="text-xs flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${step.status === "APPROVED" ? "bg-green-400" : step.status === "REJECTED" ? "bg-red-400" : "bg-muted-foreground"}`} />
                  <span className="text-muted-foreground">{t("approvals.step", { order: step.order })}</span>
                  <span className="capitalize">{t(`approvals.status.${step.status}`)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {approvals.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t("approvals.empty")}</div>
      )}
    </div>
  );
}
