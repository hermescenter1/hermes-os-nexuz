import { describe, it, expect } from "vitest";
import { deriveErpAttention, budgetVariancePct, formatErpMoney } from "../logic";
import type { ErpOverview } from "@/lib/erp/types";

/**
 * PHASE 87H — the ERP attention layer is derived DETERMINISTICALLY from real
 * ErpOverview fields (threshold rules). No inferred urgency, no fabrication.
 */

function overview(over: Partial<ErpOverview> = {}): ErpOverview {
  return {
    activeProjects: 3, overdueTasks: 0, openWorkOrders: 2, inventoryWarnings: 0,
    pendingApprovals: 0, totalBudget: 1_000_000, totalActualCost: 900_000,
    resourceUtilization: 60, recentActivity: [],
    projectsByStatus: { PLANNED: 1, ACTIVE: 2, ON_HOLD: 0, COMPLETED: 0, CANCELLED: 0 },
    tasksByStatus: { TODO: 4, IN_PROGRESS: 3, BLOCKED: 0, REVIEW: 1, DONE: 5, CANCELLED: 0 },
    workOrdersByStatus: { OPEN: 1, ASSIGNED: 1, IN_PROGRESS: 0, WAITING_APPROVAL: 0, COMPLETED: 3, CANCELLED: 0 },
    kpiSummary: [],
    ...over,
  };
}

describe("deriveErpAttention — deterministic thresholds, stable priority", () => {
  it("surfaces overdue → WO-waiting → pending approvals → blocked → inventory, in that order", () => {
    const items = deriveErpAttention(overview({
      overdueTasks: 2, pendingApprovals: 3, inventoryWarnings: 4,
      tasksByStatus: { TODO: 1, IN_PROGRESS: 1, BLOCKED: 2, REVIEW: 0, DONE: 0, CANCELLED: 0 },
      workOrdersByStatus: { OPEN: 1, ASSIGNED: 0, IN_PROGRESS: 0, WAITING_APPROVAL: 1, COMPLETED: 0, CANCELLED: 0 },
    }));
    expect(items.map((i) => i.kind)).toEqual([
      "overdueTasks", "woWaitingApproval", "pendingApprovals", "blockedTasks", "inventoryLow",
    ]);
    // destinations are real ERP routes
    expect(items.find((i) => i.kind === "overdueTasks")?.href).toBe("/erp/tasks");
    expect(items.find((i) => i.kind === "pendingApprovals")?.href).toBe("/erp/approvals");
    expect(items.find((i) => i.kind === "inventoryLow")?.href).toBe("/erp/inventory");
    // severity: inventory is review, the rest are action
    expect(items.find((i) => i.kind === "inventoryLow")?.severity).toBe("review");
    expect(items.find((i) => i.kind === "overdueTasks")?.severity).toBe("action");
  });

  it("returns an empty list when everything is clear (drives the calm empty state)", () => {
    expect(deriveErpAttention(overview())).toEqual([]);
  });

  it("each item's count is the exact real overview field (no fabrication)", () => {
    const items = deriveErpAttention(overview({ pendingApprovals: 7 }));
    expect(items).toEqual([{ id: "approvals", kind: "pendingApprovals", severity: "action", count: 7, href: "/erp/approvals" }]);
  });
});

describe("budgetVariancePct — deterministic from real budget vs. actual", () => {
  it("computes the signed variance percentage; guards divide-by-zero", () => {
    expect(budgetVariancePct(1_000_000, 1_100_000)).toBe(10);
    expect(budgetVariancePct(1_000_000, 900_000)).toBe(-10);
    expect(budgetVariancePct(0, 500)).toBe(0);
  });
});

describe("formatErpMoney — the ERP's existing $K/$M convention", () => {
  it("formats M and K", () => {
    expect(formatErpMoney(2_400_000)).toBe("$2.4M");
    expect(formatErpMoney(340_000)).toBe("$340K");
  });
});
