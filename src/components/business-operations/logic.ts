// PHASE 87H — pure derivation of the ERP attention layer from the EXISTING
// ErpOverview (JSX-free, unit-testable). Every item is a deterministic
// threshold on a real overview field — no inferred urgency, no fabrication.
//
// Deterministic rules (each documented, stable priority order):
//   1. overdueTasks   > 0            → action  → /erp/tasks
//   2. woWaitingApproval (WO status) > 0 → action → /erp/work-orders
//   3. pendingApprovals > 0          → action  → /erp/approvals
//   4. blockedTasks (task status)   > 0 → action → /erp/tasks
//   5. inventoryWarnings > 0         → review  → /erp/inventory

import type { ErpOverview } from "@/lib/erp/types";

export interface ErpAttentionItem {
  id: string;
  kind: "overdueTasks" | "woWaitingApproval" | "pendingApprovals" | "blockedTasks" | "inventoryLow";
  severity: "action" | "review";
  count: number;
  href: string;
}

export function deriveErpAttention(overview: ErpOverview): ErpAttentionItem[] {
  const items: ErpAttentionItem[] = [];
  const blocked = overview.tasksByStatus?.BLOCKED ?? 0;
  const woWaiting = overview.workOrdersByStatus?.WAITING_APPROVAL ?? 0;

  if (overview.overdueTasks > 0)
    items.push({ id: "overdue", kind: "overdueTasks", severity: "action", count: overview.overdueTasks, href: "/erp/tasks" });
  if (woWaiting > 0)
    items.push({ id: "wo-waiting", kind: "woWaitingApproval", severity: "action", count: woWaiting, href: "/erp/work-orders" });
  if (overview.pendingApprovals > 0)
    items.push({ id: "approvals", kind: "pendingApprovals", severity: "action", count: overview.pendingApprovals, href: "/erp/approvals" });
  if (blocked > 0)
    items.push({ id: "blocked", kind: "blockedTasks", severity: "action", count: blocked, href: "/erp/tasks" });
  if (overview.inventoryWarnings > 0)
    items.push({ id: "inventory", kind: "inventoryLow", severity: "review", count: overview.inventoryWarnings, href: "/erp/inventory" });

  return items;
}

/** Budget variance (%) — deterministic from real budget vs. actual cost. */
export function budgetVariancePct(totalBudget: number, totalActualCost: number): number {
  if (totalBudget <= 0) return 0;
  return Math.round(((totalActualCost - totalBudget) / totalBudget) * 100);
}

/** Compact $K/$M money label — the ERP dashboard's existing convention. */
export function formatErpMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${(v / 1_000).toFixed(0)}K`;
}
