import { describe, it, expect } from "vitest";
import {
  deriveAssetAttention, deriveMaintenanceAttention, orderedDistribution,
} from "../logic";
import type { AssetDashboard } from "@/lib/assets/types";
import type { CmmsDashboard } from "@/lib/cmms/types";

/**
 * PHASE 87I — both attention layers derive DETERMINISTICALLY from real
 * server-computed dashboard fields (threshold rules, stable priority order).
 * No inferred failure risk, no fabricated health/RUL/predictive output.
 */

function assets(over: Partial<AssetDashboard> = {}): AssetDashboard {
  return {
    totalAssets: 40, criticalAssets: 0, degradedAssets: 0, atRiskAssets: 0,
    assetsWithOpenWO: 0, assetsMissingDocs: 0,
    assetsByType: {}, assetsByStatus: { IN_SERVICE: 30, DEGRADED: 4, RETIRED: 6 },
    assetsByCriticality: { CRITICAL: 3, HIGH: 7, LOW: 30 },
    lifecycleDistribution: {}, recentLifecycleEvents: [], topCriticalAssets: [],
    healthDistribution: { healthy: 30, monitor: 5, atRisk: 3, critical: 1, unknown: 1 },
    ...over,
  };
}

function cmms(over: Partial<CmmsDashboard> = {}): CmmsDashboard {
  return {
    kpis: {
      mtbf: 120, mttr: 4, availability: 97.5, maintenanceCompliance: 88,
      overdueCount: 0, emergencyWorkPct: 5, technicianUtilization: 70,
      totalDowntimeHours: 12, totalCost: 1000, failureCount: 2,
      completedThisMonth: 9, scheduledThisMonth: 14,
    },
    tasksByStatus: { SCHEDULED: 6, IN_PROGRESS: 3, ON_HOLD: 0, COMPLETED: 9 },
    tasksByType: {}, tasksByPriority: { HIGH: 4, MEDIUM: 8 },
    recentTasks: [], recentFailures: [], upcomingTasks: [],
    downtimeTrend: [], costTrend: [],
    ...over,
  };
}

describe("deriveAssetAttention — deterministic thresholds, stable order", () => {
  it("orders critical → degraded → at-risk → open-WO → missing-docs with real counts", () => {
    const items = deriveAssetAttention(assets({
      criticalAssets: 3, degradedAssets: 4, atRiskAssets: 2,
      assetsWithOpenWO: 5, assetsMissingDocs: 7,
    }));
    expect(items.map((i) => i.kind)).toEqual([
      "criticalAssets", "degradedAssets", "atRiskAssets", "assetsWithOpenWO", "assetsMissingDocs",
    ]);
    expect(items.map((i) => i.count)).toEqual([3, 4, 2, 5, 7]);
    expect(items.map((i) => i.severity)).toEqual(["action", "action", "review", "review", "review"]);
  });

  it("routes each item to its real destination — open work crosses into CMMS", () => {
    const items = deriveAssetAttention(assets({ criticalAssets: 1, assetsWithOpenWO: 2, assetsMissingDocs: 1 }));
    expect(items.find((i) => i.kind === "criticalAssets")?.href).toBe("/assets/criticality");
    // Asset Registry does NOT own maintenance work — it links to CMMS.
    expect(items.find((i) => i.kind === "assetsWithOpenWO")?.href).toBe("/cmms/work-orders");
    expect(items.find((i) => i.kind === "assetsMissingDocs")?.href).toBe("/assets/documents");
  });

  it("empty when the registry is clear (drives the calm empty state)", () => {
    expect(deriveAssetAttention(assets())).toEqual([]);
  });
});

describe("deriveMaintenanceAttention — deterministic thresholds, stable order", () => {
  it("orders overdue → on-hold → failures → upcoming with real counts and CMMS destinations", () => {
    const items = deriveMaintenanceAttention(cmms({
      kpis: { ...cmms().kpis, overdueCount: 4 },
      tasksByStatus: { ON_HOLD: 2, SCHEDULED: 5 },
      recentFailures: [{ id: "f1" }, { id: "f2" }] as unknown as CmmsDashboard["recentFailures"],
      upcomingTasks: [{ id: "t1" }] as unknown as CmmsDashboard["upcomingTasks"],
    }));
    expect(items.map((i) => i.kind)).toEqual(["overdueWork", "blockedWork", "openFailures", "upcomingWork"]);
    expect(items.map((i) => i.count)).toEqual([4, 2, 2, 1]);
    expect(items.map((i) => i.href)).toEqual([
      "/cmms/work-orders", "/cmms/tasks", "/cmms/failures", "/cmms/schedules",
    ]);
    // every CMMS destination stays inside CMMS — never an ERP work-order route
    expect(items.every((i) => i.href.startsWith("/cmms/"))).toBe(true);
    expect(items.some((i) => i.href.startsWith("/erp/"))).toBe(false);
  });

  it("empty when maintenance queues are clear", () => {
    expect(deriveMaintenanceAttention(cmms())).toEqual([]);
  });

  it("uses the server-computed overdue count verbatim (no client recomputation)", () => {
    const items = deriveMaintenanceAttention(cmms({ kpis: { ...cmms().kpis, overdueCount: 11 } }));
    expect(items[0]).toEqual({ id: "overdue", kind: "overdueWork", severity: "action", count: 11, href: "/cmms/work-orders" });
  });
});

describe("orderedDistribution — enum order preserved, zero rows dropped", () => {
  it("keeps the supplied enum order and omits zero counts", () => {
    const rows = orderedDistribution(
      ["IN_SERVICE", "DEGRADED", "RETIRED", "STANDBY"] as const,
      { RETIRED: 6, IN_SERVICE: 30, DEGRADED: 4, STANDBY: 0 },
    );
    expect(rows).toEqual([
      { key: "IN_SERVICE", count: 30 },
      { key: "DEGRADED", count: 4 },
      { key: "RETIRED", count: 6 },
    ]);
  });

  it("tolerates a missing distribution object", () => {
    expect(orderedDistribution(["A", "B"] as const, undefined)).toEqual([]);
  });
});
