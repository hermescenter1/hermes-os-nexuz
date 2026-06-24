/**
 * Phase 49 — Asset Alert management (read/dismiss only).
 * Creation is handled exclusively by the automation engine (automation.ts).
 */

import { getPrisma } from "@/lib/db/prisma";

export type AlertType     = "CRITICAL_RISK" | "HEALTH_DEGRADATION" | "COMMUNICATION_FAILURE" | "KNOWLEDGE_COVERAGE_LOW";
export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AssetAlertRecord {
  id:             string;
  organizationId: string;
  assetId:        string;
  alertType:      AlertType;
  severity:       AlertSeverity;
  title:          string;
  description:    string;
  metadata:       Record<string, unknown>;
  dismissed:      boolean;
  dismissedAt:    string | null;
  dismissedBy:    string | null;
  resolvedAt:     string | null;
  createdAt:      string;
  updatedAt:      string;
}

type FM = { findMany:  (a: unknown) => Promise<Record<string, unknown>[]> };
type FF = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
type FU = { update:    (a: unknown) => Promise<Record<string, unknown>> };
type Db = Record<string, FM | FF | FU>;

function row(r: Record<string, unknown>): AssetAlertRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    assetId:        r.assetId        as string,
    alertType:      r.alertType      as AlertType,
    severity:       r.severity       as AlertSeverity,
    title:          r.title          as string,
    description:    r.description    as string,
    metadata:       (r.metadata       ?? {}) as Record<string, unknown>,
    dismissed:      r.dismissed       as boolean,
    dismissedAt:    r.dismissedAt ? new Date(r.dismissedAt as string).toISOString() : null,
    dismissedBy:    (r.dismissedBy    ?? null) as string | null,
    resolvedAt:     r.resolvedAt ? new Date(r.resolvedAt as string).toISOString() : null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

export async function getAssetAlerts(
  assetId:        string,
  organizationId: string,
  opts?: { includeDismissed?: boolean }
): Promise<AssetAlertRecord[]> {
  const db = await getPrisma();
  if (!db) return [];
  const r = db as unknown as Db;
  const where: Record<string, unknown> = { assetId, organizationId };
  if (!opts?.includeDismissed) where.dismissed = false;
  const rows = await (r.assetAlert as FM).findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(row);
}

export async function getOrgAlerts(
  organizationId: string,
  opts?: { includeDismissed?: boolean; alertType?: AlertType }
): Promise<AssetAlertRecord[]> {
  const db = await getPrisma();
  if (!db) return [];
  const r = db as unknown as Db;
  const where: Record<string, unknown> = { organizationId };
  if (!opts?.includeDismissed) where.dismissed = false;
  if (opts?.alertType) where.alertType = opts.alertType;
  const rows = await (r.assetAlert as FM).findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map(row);
}

export async function dismissAlert(
  alertId:        string,
  organizationId: string,
  dismissedBy?:   string
): Promise<AssetAlertRecord | null> {
  const db = await getPrisma();
  if (!db) return null;
  const r = db as unknown as Db;

  const existing = await (r.assetAlert as FF).findFirst({
    where: { id: alertId, organizationId },
  });
  if (!existing) return null;

  const updated = await (r.assetAlert as FU).update({
    where: { id: alertId },
    data: {
      dismissed:   true,
      dismissedAt: new Date(),
      dismissedBy: dismissedBy ?? null,
    },
  });
  return row(updated);
}
