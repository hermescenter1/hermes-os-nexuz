"use client";

import { useState }        from "react";
import { useTranslations, useLocale } from "next-intl";
import type { ErpApprovalRequest } from "@/lib/erp/types";
import type { ErpApprovalRequestView } from "@/lib/erp/operations";
import { formatDate } from "@/lib/i18n/format";
import { ErpPagedList, LoadMore, usePagedItems } from "./ErpPagedList";
import type { ChildPage } from "@/lib/erp/pagination";

const STATUS_COLOR: Record<string, string> = {
  PENDING:   "bg-yellow-500/15 text-yellow-400",
  APPROVED:  "bg-green-500/15 text-green-400",
  REJECTED:  "bg-red-500/15 text-red-400",
  CANCELLED: "bg-muted text-muted-foreground",
};

/** Decisions carry the row version (optimistic concurrency), a reason, and a fresh idempotency key. */
export function ApprovalListClient({ page, endpoint }: { page: ChildPage<ErpApprovalRequestView>; endpoint: string }) {
  const locale = useLocale();
  const t = useTranslations("enterpriseOperations");
  const { items: approvals, setItems: setApprovals, hasMore, busy: loadingMore, failed: loadFailed, loadMore } = usePagedItems(page, endpoint);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    const apr = approvals.find(a => a.id === id);
    const reason = (reasons[id] ?? "").trim();
    if (!apr || !reason || busyId) return;
    setBusyId(id);
    setFailedId(null);
    try {
      const res = await fetch(`/api/erp/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ version: apr.version, status, reason }),
      });
      if (res.ok) {
        // The decision answers the request row; the steps page already held in state is kept.
        const updated = await res.json() as ErpApprovalRequest;
        setApprovals(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
        setReasons(prev => ({ ...prev, [id]: "" }));
      } else {
        setFailedId(id);
      }
    } catch {
      setFailedId(id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {approvals.map(apr => {
        const reason = (reasons[apr.id] ?? "").trim();
        return (
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
              </div>
            </div>

            {apr.status === "PENDING" && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs text-muted-foreground" htmlFor={`reason-${apr.id}`}>{t("approvals.reasonLabel")}</label>
                <textarea
                  id={`reason-${apr.id}`}
                  value={reasons[apr.id] ?? ""}
                  maxLength={1000}
                  onChange={e => setReasons(prev => ({ ...prev, [apr.id]: e.target.value }))}
                  rows={2}
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!reason || busyId !== null}
                    onClick={() => decide(apr.id, "APPROVED")}
                    className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 disabled:opacity-40"
                  >{t("approvals.approve")}</button>
                  <button
                    type="button"
                    disabled={!reason || busyId !== null}
                    onClick={() => decide(apr.id, "REJECTED")}
                    className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 disabled:opacity-40"
                  >{t("approvals.reject")}</button>
                </div>
                {failedId === apr.id && <p role="alert" className="text-xs text-red-400">{t("approvals.decisionFailed")}</p>}
              </div>
            )}

            {apr.steps.items.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <ErpPagedList
                  page={apr.steps}
                  endpoint={`/api/erp/approvals/${apr.id}/steps`}
                  renderItem={step => (
                    <div className="text-xs flex items-center gap-1.5 py-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${step.status === "APPROVED" ? "bg-green-400" : step.status === "REJECTED" ? "bg-red-400" : "bg-muted-foreground"}`} />
                      <span className="text-muted-foreground">{t("approvals.step", { order: step.order })}</span>
                      <span className="capitalize">{t(`approvals.status.${step.status}`)}</span>
                    </div>
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
      {approvals.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t("approvals.empty")}</div>
      )}
      <LoadMore hasMore={hasMore} busy={loadingMore} failed={loadFailed} onLoad={loadMore} />
    </div>
  );
}
