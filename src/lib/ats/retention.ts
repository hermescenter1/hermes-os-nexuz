/**
 * ATS-B2 — recruitment-data retention: evaluation and anonymisation.
 *
 * The retention PERIOD is never a constant here. It is read from the
 * organization's APPROVED, enabled RetentionPolicy for RECRUITMENT_CANDIDATE
 * — the same row the intake gate requires — and an organization without one
 * has nothing to sweep.
 *
 *   * `retentionTrigger = CREATION`      expiry = the stamp made at intake
 *   * `retentionTrigger = LAST_ACTIVITY` expiry = updatedAt + retentionDays,
 *                                        re-evaluated at sweep time
 *   * any other trigger                  REVIEW_REQUIRED — reported, not acted on
 *
 * LEGAL HOLD is honoured through the compliance engine's own `isUnderLegalHold`
 * (SUBJECT = the candidate, RESOURCE = the application, RESOURCE_TYPE,
 * ORGANIZATION, DATE_RANGE). A held application is reported and skipped.
 *
 * WHAT ANONYMISATION DOES: nulls résumé text, cover letter and notes on the
 * APPLICATION and stamps `anonymizedAt`. It never touches the global
 * AtsCandidate row — that record may back applications in other
 * organizations, and its lifecycle belongs to the Phase 97 erasure workflow.
 * A `DELETE` action is executed as soft-delete + anonymisation; hard deletion
 * is the erasure workflow's job, not a sweep's.
 *
 * DRY RUN by default. Execution needs `execute: true` AND a policy whose
 * `dryRunOnly` is false. Everything else only reports.
 */

import { getPrisma } from "@/lib/db/prisma";
import { isUnderLegalHold, type HoldLike } from "@/lib/compliance/retention-engine";
import { RECRUITMENT_DATA_CLASS } from "./application";
import { readSettingsOrDefaults, type SettingsReader } from "./settings/defaults";
import { buildRecruitmentAuditCreate } from "./recruitment-audit";

export interface RetentionPolicyRow {
  id: string;
  retentionDays: number | null;
  retentionTrigger: string;
  action: string;
  dryRunOnly: boolean;
  legalHoldAware: boolean;
}

export interface ApplicationRetentionRow {
  id: string;
  candidateId: string;
  createdAt: Date;
  updatedAt: Date;
  retentionExpiresAt: Date | null;
  anonymizedAt: Date | null;
  withdrawnAt: Date | null;
}

export type RetentionVerdict =
  | { decision: "RETAIN"; reason: string }
  | { decision: "EXPIRED"; reason: string }
  | { decision: "HELD"; reason: string }
  | { decision: "REVIEW_REQUIRED"; reason: string };

/** Pure: decide one application against one policy and the active holds. */
export function evaluateApplicationRetention(
  app: ApplicationRetentionRow,
  policy: RetentionPolicyRow,
  holds: readonly HoldLike[],
  organizationId: string,
  now: Date,
): RetentionVerdict {
  if (app.anonymizedAt) return { decision: "RETAIN", reason: "already anonymised" };
  if (typeof policy.retentionDays !== "number" || policy.retentionDays <= 0) {
    return { decision: "REVIEW_REQUIRED", reason: "policy has no retention period" };
  }
  const days = policy.retentionDays * 86_400_000;
  let expiresAt: Date | null;
  switch (policy.retentionTrigger) {
    case "CREATION":
      expiresAt = app.retentionExpiresAt ?? new Date(app.createdAt.getTime() + days);
      break;
    case "LAST_ACTIVITY":
      expiresAt = new Date(app.updatedAt.getTime() + days);
      break;
    default:
      return { decision: "REVIEW_REQUIRED", reason: `trigger ${policy.retentionTrigger} is not automated` };
  }
  if (expiresAt.getTime() > now.getTime()) return { decision: "RETAIN", reason: `expires ${expiresAt.toISOString()}` };

  if (
    policy.legalHoldAware &&
    isUnderLegalHold(
      { organizationId, subjectId: app.candidateId, resourceType: "AtsApplication", resourceId: app.id, timestamp: app.createdAt },
      [...holds],
    )
  ) {
    return { decision: "HELD", reason: "active legal hold covers this application" };
  }
  return { decision: "EXPIRED", reason: `expired ${expiresAt.toISOString()}` };
}

export interface RetentionSweepReport {
  organizationId: string;
  policyId: string | null;
  dryRun: boolean;
  evaluated: number;
  retained: number;
  expired: number;
  held: number;
  reviewRequired: number;
  anonymized: number;
  storeUnavailable: boolean;
  action: string | null;
  /**
   * ATS-M1 — the organization SELECTED a policy in its ATS settings, but that
   * policy is not (or no longer) approved, enabled and effective. Nothing is
   * anonymised and no other policy is guessed in its place; the flag makes
   * the stop visible instead of silent.
   */
  selectedPolicyUnavailable: boolean;
}

type Client = SettingsReader & {
  retentionPolicy: { findFirst: (a: unknown) => Promise<RetentionPolicyRow | null> };
  legalHold: { findMany: (a: unknown) => Promise<HoldLike[]> };
  atsApplication: {
    findMany: (a: unknown) => Promise<ApplicationRetentionRow[]>;
    updateMany: (a: unknown) => Promise<{ count: number }>;
  };
  auditLog: { create: (a: unknown) => Promise<unknown> };
  $transaction: <T>(fn: (tx: Client) => Promise<T>) => Promise<T>;
};

export const RETENTION_SWEEP_BATCH = 500;

export async function sweepExpiredApplications(args: {
  organizationId: string;
  now?: Date;
  execute?: boolean;
  correlationId?: string;
}): Promise<RetentionSweepReport> {
  const now = args.now ?? new Date();
  const base: RetentionSweepReport = {
    organizationId: args.organizationId,
    policyId: null,
    dryRun: true,
    evaluated: 0,
    retained: 0,
    expired: 0,
    held: 0,
    reviewRequired: 0,
    anonymized: 0,
    storeUnavailable: false,
    action: null,
    selectedPolicyUnavailable: false,
  };
  const prisma = (await getPrisma()) as unknown as Client | null;
  if (!prisma) return { ...base, storeUnavailable: true };

  // ATS-M1 — the policy the organization SELECTED (when it selected one), and
  // only once it is effective. A settings read failure is reported, never
  // guessed around: no policy, nothing anonymised.
  let selectedPolicyId: string | null;
  try {
    selectedPolicyId = (await readSettingsOrDefaults(prisma, args.organizationId)).retentionPolicyId;
  } catch {
    return { ...base, storeUnavailable: true };
  }
  const policy = await prisma.retentionPolicy.findFirst({
    where: {
      organizationId: args.organizationId,
      dataClass: RECRUITMENT_DATA_CLASS,
      approvalState: "APPROVED",
      enabled: true,
      retentionDays: { not: null },
      OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
      ...(selectedPolicyId ? { id: selectedPolicyId } : {}),
    },
    select: { id: true, retentionDays: true, retentionTrigger: true, action: true, dryRunOnly: true, legalHoldAware: true },
  });
  if (!policy) return selectedPolicyId ? { ...base, selectedPolicyUnavailable: true } : base;

  const execute = args.execute === true && policy.dryRunOnly === false;
  const automated = policy.action === "ANONYMISE" || policy.action === "DELETE";
  const report: RetentionSweepReport = { ...base, policyId: policy.id, dryRun: !execute, action: policy.action };

  const holds = await prisma.legalHold.findMany({
    where: { organizationId: args.organizationId, status: "ACTIVE" },
  });
  const rows = await prisma.atsApplication.findMany({
    where: { organizationId: args.organizationId, deletedAt: null, anonymizedAt: null },
    select: { id: true, candidateId: true, createdAt: true, updatedAt: true, retentionExpiresAt: true, anonymizedAt: true, withdrawnAt: true },
    orderBy: { createdAt: "asc" },
    take: RETENTION_SWEEP_BATCH,
  });

  for (const app of rows) {
    report.evaluated++;
    const v = evaluateApplicationRetention(app, policy, holds, args.organizationId, now);
    if (v.decision === "RETAIN") report.retained++;
    else if (v.decision === "HELD") report.held++;
    else if (v.decision === "REVIEW_REQUIRED") report.reviewRequired++;
    else {
      report.expired++;
      if (!execute || !automated) continue;
      try {
        await prisma.$transaction(async (tx) => {
          const changed = await tx.atsApplication.updateMany({
            where: { id: app.id, organizationId: args.organizationId, anonymizedAt: null },
            data: {
              resumeText: null,
              coverLetter: null,
              notes: null,
              anonymizedAt: now,
              ...(policy.action === "DELETE" ? { deletedAt: now } : {}),
            },
          });
          if (changed.count !== 1) return;
          await tx.auditLog.create(
            buildRecruitmentAuditCreate({
              action: "recruitment.application.anonymized",
              entityType: "AtsApplication",
              entityId: app.id,
              userId: null,
              organizationId: args.organizationId,
              correlationId: args.correlationId,
              metadata: {
                reason: `retention policy ${policy.id} (${policy.action}, ${policy.retentionTrigger}) expired: ${v.reason}`,
                before: { anonymized: false },
                after: { anonymized: true, softDeleted: policy.action === "DELETE" },
                stage: "B2",
                actor: "SYSTEM_RETENTION",
              },
            }),
          );
          report.anonymized++;
        });
      } catch {
        /* the row stays as it was; the next sweep sees it again */
      }
    }
  }
  return report;
}
