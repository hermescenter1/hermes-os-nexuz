// PHASE 87I — pure derivation of the Asset Registry + CMMS attention layers
// (JSX-free, unit-testable). Every item is a deterministic threshold on a real
// server-computed dashboard field — no inferred failure risk, no fabrication.
//
// ASSET rules (stable priority order):
//   1. criticalAssets    > 0 → action → /assets/criticality
//   2. degradedAssets    > 0 → action → /assets/health
//   3. atRiskAssets      > 0 → review → /assets/health
//   4. assetsWithOpenWO  > 0 → review → /cmms/work-orders   (cross-module link)
//   5. assetsMissingDocs > 0 → review → /assets/documents
//
// MAINTENANCE rules (stable priority order):
//   1. kpis.overdueCount        > 0 → action → /cmms/work-orders
//   2. tasksByStatus.ON_HOLD    > 0 → action → /cmms/tasks
//   3. recentFailures.length    > 0 → review → /cmms/failures
//   4. upcomingTasks.length     > 0 → review → /cmms/schedules

import type { AssetDashboard } from "@/lib/assets/types";
import type { CmmsDashboard } from "@/lib/cmms/types";

export type AssetAttentionKind =
  | "criticalAssets" | "degradedAssets" | "atRiskAssets"
  | "assetsWithOpenWO" | "assetsMissingDocs";

export type MaintenanceAttentionKind =
  | "overdueWork" | "blockedWork" | "openFailures" | "upcomingWork";

export interface AmAttentionItem<K extends string> {
  id: string;
  kind: K;
  severity: "action" | "review";
  count: number;
  href: string;
}

export function deriveAssetAttention(d: AssetDashboard): AmAttentionItem<AssetAttentionKind>[] {
  const items: AmAttentionItem<AssetAttentionKind>[] = [];
  if (d.criticalAssets > 0)
    items.push({ id: "critical", kind: "criticalAssets", severity: "action", count: d.criticalAssets, href: "/assets/criticality" });
  if (d.degradedAssets > 0)
    items.push({ id: "degraded", kind: "degradedAssets", severity: "action", count: d.degradedAssets, href: "/assets/health" });
  if (d.atRiskAssets > 0)
    items.push({ id: "at-risk", kind: "atRiskAssets", severity: "review", count: d.atRiskAssets, href: "/assets/health" });
  if (d.assetsWithOpenWO > 0)
    items.push({ id: "open-wo", kind: "assetsWithOpenWO", severity: "review", count: d.assetsWithOpenWO, href: "/cmms/work-orders" });
  if (d.assetsMissingDocs > 0)
    items.push({ id: "missing-docs", kind: "assetsMissingDocs", severity: "review", count: d.assetsMissingDocs, href: "/assets/documents" });
  return items;
}

export function deriveMaintenanceAttention(d: CmmsDashboard): AmAttentionItem<MaintenanceAttentionKind>[] {
  const items: AmAttentionItem<MaintenanceAttentionKind>[] = [];
  const onHold = d.tasksByStatus?.ON_HOLD ?? 0;
  if (d.kpis.overdueCount > 0)
    items.push({ id: "overdue", kind: "overdueWork", severity: "action", count: d.kpis.overdueCount, href: "/cmms/work-orders" });
  if (onHold > 0)
    items.push({ id: "on-hold", kind: "blockedWork", severity: "action", count: onHold, href: "/cmms/tasks" });
  if (d.recentFailures.length > 0)
    items.push({ id: "failures", kind: "openFailures", severity: "review", count: d.recentFailures.length, href: "/cmms/failures" });
  if (d.upcomingTasks.length > 0)
    items.push({ id: "upcoming", kind: "upcomingWork", severity: "review", count: d.upcomingTasks.length, href: "/cmms/schedules" });
  return items;
}

/** Non-zero entries of a distribution, preserving the supplied enum order. */
export function orderedDistribution<K extends string>(
  order: readonly K[],
  dist: Record<string, number> | undefined,
): { key: K; count: number }[] {
  return order
    .map((key) => ({ key, count: dist?.[key] ?? 0 }))
    .filter((row) => row.count > 0);
}
