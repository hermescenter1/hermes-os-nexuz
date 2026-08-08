// PHASE 96 runtime — trial lifecycle (database-authoritative).
//
// Exactly ONE automatic trial per organisation. The unique organizationId index
// on OrganizationTrial is the authority — a browser cannot reset or recreate a
// trial. Trial expiry NEVER deletes tenant data. An exceptional extension is a
// separate, audited, time-bounded entitlement override (see override-service),
// never a silent mutation of trialEndsAt.

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { BILLING_GOVERNANCE_AUDIT, buildBillingAuditMetadata } from "../audit";
import { TRIAL_DURATION_DAYS, MS_PER_DAY } from "../commercial-policy";
import { isTrialEligiblePlan } from "../plan-registry";
import { isPlanKey, type PlanKey } from "../types";

export type StartTrialResult =
  | { ok: true; trialId: string; endsAt: Date }
  | { ok: false; code: "PLAN_NOT_TRIAL_ELIGIBLE" | "TRIAL_ALREADY_USED" | "NO_DB" | "VALIDATION"; message: string };

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "P2002");
}

/**
 * Start the single automatic trial for an organisation. Idempotent at the DB
 * level: a second attempt hits the unique constraint and is rejected as
 * TRIAL_ALREADY_USED (never a second trial).
 */
export async function startAutomaticTrial(input: {
  organizationId: string;
  planKey: string;
  now?: Date;
}): Promise<StartTrialResult> {
  const now = input.now ?? new Date();
  if (!input.organizationId) return { ok: false, code: "VALIDATION", message: "organizationId required" };
  if (!isPlanKey(input.planKey)) return { ok: false, code: "VALIDATION", message: "unknown plan" };
  if (!isTrialEligiblePlan(input.planKey as PlanKey)) {
    return { ok: false, code: "PLAN_NOT_TRIAL_ELIGIBLE", message: "plan is not trial-eligible" };
  }

  const client = (await getPrisma()) as unknown as PrismaClient | null;
  if (!client) return { ok: false, code: "NO_DB", message: "database unavailable" };

  const endsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * MS_PER_DAY);
  try {
    const row = await client.organizationTrial.create({
      data: {
        organizationId: input.organizationId,
        planKey: input.planKey,
        source: "AUTOMATIC",
        startedAt: now,
        endsAt,
      },
    });
    await recordAuditEvent({
      action: BILLING_GOVERNANCE_AUDIT.TRIAL_STARTED,
      entityType: "OrganizationTrial",
      entityId: row.id,
      organizationId: input.organizationId,
      outcome: "success",
      metadata: buildBillingAuditMetadata({
        organizationId: input.organizationId,
        planKey: input.planKey as PlanKey,
        trialEndsAt: endsAt,
        provider: "AUTOMATIC",
      }),
    });
    return { ok: true, trialId: row.id, endsAt };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, code: "TRIAL_ALREADY_USED", message: "organisation already had a trial" };
    throw err;
  }
}

/** Whether the organisation's automatic trial (if any) is still active. */
export async function trialIsActive(organizationId: string, now: Date = new Date()): Promise<boolean> {
  const client = (await getPrisma()) as unknown as PrismaClient | null;
  if (!client) return false; // fail closed
  const row = await client.organizationTrial.findUnique({ where: { organizationId } });
  if (!row) return false;
  if (row.convertedAt) return false;
  return row.endsAt.getTime() > now.getTime();
}

/** Record a trial conversion (data preserved). Does not delete anything. */
export async function markTrialConverted(organizationId: string, now: Date = new Date()): Promise<void> {
  const client = (await getPrisma()) as unknown as PrismaClient | null;
  if (!client) return;
  const res = await client.organizationTrial.updateMany({
    where: { organizationId, convertedAt: null },
    data: { convertedAt: now },
  });
  if (res.count > 0) {
    await recordAuditEvent({
      action: BILLING_GOVERNANCE_AUDIT.TRIAL_CONVERTED,
      entityType: "OrganizationTrial",
      organizationId,
      outcome: "success",
      metadata: buildBillingAuditMetadata({ organizationId }),
    });
  }
}
