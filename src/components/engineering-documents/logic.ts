// PHASE 87J — pure derivation of the EDMS attention layer from the EXISTING
// EdmsDashboard (JSX-free, unit-testable). Every item is a deterministic
// threshold on a real dashboard field — no inferred urgency, no fabricated
// compliance/quality/audit-readiness metric.
//
// Deterministic rules (stable priority order):
//   1. pendingApprovals > 0                        → action → /documents/approvals
//   2. reviewCount      > 0                        → action → /documents/approvals
//   3. rejectedCount    > 0                        → action → /documents/explorer
//   4. documents whose currentRevision is null     → review → /documents/revisions
//      (counted over the dashboard's recentDocuments window ONLY — the summary
//      carries no register-wide "missing revision" figure, so the count is
//      explicitly scoped to what the server actually returned)
//   5. activeCheckouts  > 0                        → review → /documents/explorer
//
// NOTE: the dashboard exposes no per-approval dueDate, so this module derives
// NO "overdue" claim. Overdue review/approval remains out of scope until the
// summary carries the dates — stating it would be fabrication.

import type { EdmsDashboard, EdmsDocument } from "@/lib/document/types";

export type DocumentAttentionKind =
  | "pendingApprovals" | "inReview" | "rejected" | "missingRevision" | "checkedOut";

export interface DocumentAttentionItem {
  id: string;
  kind: DocumentAttentionKind;
  severity: "action" | "review";
  count: number;
  href: string;
}

/** Documents in the returned window that carry no current revision code. */
export function documentsWithoutCurrentRevision(docs: EdmsDocument[]): EdmsDocument[] {
  return docs.filter((d) => !d.deletedAt && (d.currentRevision === null || d.currentRevision === ""));
}

export function deriveDocumentAttention(d: EdmsDashboard): DocumentAttentionItem[] {
  const items: DocumentAttentionItem[] = [];
  const missingRevision = documentsWithoutCurrentRevision(d.recentDocuments ?? []).length;

  if (d.pendingApprovals > 0)
    items.push({ id: "approvals", kind: "pendingApprovals", severity: "action", count: d.pendingApprovals, href: "/documents/approvals" });
  if (d.reviewCount > 0)
    items.push({ id: "review", kind: "inReview", severity: "action", count: d.reviewCount, href: "/documents/approvals" });
  if (d.rejectedCount > 0)
    items.push({ id: "rejected", kind: "rejected", severity: "action", count: d.rejectedCount, href: "/documents/explorer" });
  if (missingRevision > 0)
    items.push({ id: "no-revision", kind: "missingRevision", severity: "review", count: missingRevision, href: "/documents/revisions" });
  if (d.activeCheckouts > 0)
    items.push({ id: "checked-out", kind: "checkedOut", severity: "review", count: d.activeCheckouts, href: "/documents/explorer" });

  return items;
}

/** Non-zero entries of a distribution, preserving the supplied enum order. */
export function orderedCounts<K extends string>(
  order: readonly K[],
  dist: Record<string, number> | undefined,
): { key: K; count: number }[] {
  return order.map((key) => ({ key, count: dist?.[key] ?? 0 })).filter((r) => r.count > 0);
}

/**
 * The engineering context a controlled document is linked to. Returns only
 * relationships the record actually carries — never a fabricated link.
 */
export function linkedContext(doc: EdmsDocument): { kind: "project" | "site" | "asset" | "workOrder"; id: string }[] {
  const out: { kind: "project" | "site" | "asset" | "workOrder"; id: string }[] = [];
  if (doc.erpProjectId) out.push({ kind: "project", id: doc.erpProjectId });
  if (doc.siteId) out.push({ kind: "site", id: doc.siteId });
  if (doc.equipmentId) out.push({ kind: "asset", id: doc.equipmentId });
  if (doc.workOrderId) out.push({ kind: "workOrder", id: doc.workOrderId });
  return out;
}
