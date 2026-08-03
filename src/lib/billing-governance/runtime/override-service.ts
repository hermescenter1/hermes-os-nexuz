// PHASE 96 runtime — Billing-Admin entitlement override service.
//
// Overrides are TIME-BOUNDED (expiresAt REQUIRED — no permanent override),
// require a reason and an approver identity, are Billing-Admin only (permission
// enforced at the route), and are fully audited. An override can never change
// tenant ownership or grant another organisation's resources — the
// organizationId is always the server-derived caller org, never from the body.

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { BILLING_GOVERNANCE_AUDIT, buildBillingAuditMetadata } from "../audit";
import { isEntitlementKey, type EntitlementKey } from "../types";

export interface CreateOverrideInput {
  organizationId: string; // server-derived caller org (authoritative)
  entitlementKey: string;
  decision: "GRANT" | "DENY";
  limitOverride?: number | null;
  reason: string;
  approvedBy: string; // userId of the authorising Billing Admin
  effectiveFrom?: Date;
  expiresAt: Date; // REQUIRED
  now?: Date;
}

export type OverrideResult =
  | { ok: true; overrideId: string }
  | { ok: false; code: "VALIDATION" | "NO_DB" | "NOT_FOUND" | "CROSS_TENANT"; message: string };

/** Create a time-bounded, audited entitlement override. Fails closed on any
 *  missing/invalid field. */
export async function createEntitlementOverride(input: CreateOverrideInput): Promise<OverrideResult> {
  const now = input.now ?? new Date();

  if (!input.organizationId) return { ok: false, code: "VALIDATION", message: "organizationId required" };
  if (!isEntitlementKey(input.entitlementKey)) return { ok: false, code: "VALIDATION", message: "unknown entitlement" };
  if (input.decision !== "GRANT" && input.decision !== "DENY") return { ok: false, code: "VALIDATION", message: "invalid decision" };
  if (!input.reason || input.reason.trim().length < 3) return { ok: false, code: "VALIDATION", message: "reason required" };
  if (!input.approvedBy) return { ok: false, code: "VALIDATION", message: "approver required" };
  if (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime())) {
    return { ok: false, code: "VALIDATION", message: "expiresAt required" };
  }
  if (input.expiresAt.getTime() <= now.getTime()) return { ok: false, code: "VALIDATION", message: "expiresAt must be in the future" };
  if (input.limitOverride !== undefined && input.limitOverride !== null) {
    if (!Number.isInteger(input.limitOverride) || input.limitOverride < 0) {
      return { ok: false, code: "VALIDATION", message: "limitOverride must be a non-negative integer" };
    }
  }

  const client = (await getPrisma()) as unknown as PrismaClient | null;
  if (!client) return { ok: false, code: "NO_DB", message: "database unavailable" };

  const row = await client.organizationEntitlementOverride.create({
    data: {
      organizationId: input.organizationId,
      entitlementKey: input.entitlementKey,
      decision: input.decision,
      limitOverride: input.limitOverride ?? null,
      reason: input.reason.trim(),
      approvedBy: input.approvedBy,
      effectiveFrom: input.effectiveFrom ?? now,
      expiresAt: input.expiresAt,
    },
  });

  await recordAuditEvent({
    action: BILLING_GOVERNANCE_AUDIT.OVERRIDE_CREATED,
    entityType: "OrganizationEntitlementOverride",
    entityId: row.id,
    organizationId: input.organizationId,
    userId: input.approvedBy,
    outcome: "success",
    metadata: buildBillingAuditMetadata({
      organizationId: input.organizationId,
      entitlementKey: input.entitlementKey as EntitlementKey,
      decision: input.decision,
      limit: input.limitOverride ?? null,
      reason: input.reason.trim(),
      approvedBy: input.approvedBy,
      effectiveFrom: input.effectiveFrom ?? now,
      expiresAt: input.expiresAt,
      overrideId: row.id,
    }),
  });

  return { ok: true, overrideId: row.id };
}

export interface RevokeOverrideInput {
  organizationId: string; // server-derived caller org
  overrideId: string;
  revokedById: string;
  now?: Date;
}

/** Revoke an override. Cross-tenant safe: the override must belong to the caller
 *  org, else NOT_FOUND (never reveals another tenant's override). */
export async function revokeEntitlementOverride(input: RevokeOverrideInput): Promise<OverrideResult> {
  const now = input.now ?? new Date();
  const client = (await getPrisma()) as unknown as PrismaClient | null;
  if (!client) return { ok: false, code: "NO_DB", message: "database unavailable" };

  // Scoped update: only rows in this org and not already revoked.
  const res = await client.organizationEntitlementOverride.updateMany({
    where: { id: input.overrideId, organizationId: input.organizationId, revokedAt: null },
    data: { revokedAt: now, revokedById: input.revokedById },
  });
  if (res.count === 0) return { ok: false, code: "NOT_FOUND", message: "override not found" };

  await recordAuditEvent({
    action: BILLING_GOVERNANCE_AUDIT.OVERRIDE_REVOKED,
    entityType: "OrganizationEntitlementOverride",
    entityId: input.overrideId,
    organizationId: input.organizationId,
    userId: input.revokedById,
    outcome: "success",
    metadata: buildBillingAuditMetadata({ organizationId: input.organizationId, overrideId: input.overrideId, approvedBy: input.revokedById }),
  });
  return { ok: true, overrideId: input.overrideId };
}

/** List active (non-revoked, unexpired) overrides for the caller org. */
export async function listActiveOverrides(organizationId: string, now: Date = new Date()) {
  const client = (await getPrisma()) as unknown as PrismaClient | null;
  if (!client) return [];
  return client.organizationEntitlementOverride.findMany({
    where: { organizationId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { approvedAt: "desc" },
  });
}
