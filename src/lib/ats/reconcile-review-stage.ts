/**
 * ATS review-visibility hotfix — the reconciliation pass for applications that
 * hold a COMPLETED AI review but were left behind the stage gate.
 *
 * WHY THIS EXISTS. The write path is atomic: `src/lib/ats/review/worker.ts`
 * creates the `AtsAiReview`, moves the application to PENDING_HUMAN_APPROVAL
 * and writes `recruitment.review.completed` inside ONE transaction, and throws
 * if the conditional transition matches zero rows. So a row that holds a
 * completed review while its application sits in AI_REVIEW_PENDING cannot be
 * produced by the current code. It CAN exist from an older build, a restored
 * backup, or a manual edit — and this module is the only safe way to repair it.
 *
 * WHAT IT WILL AND WILL NOT DO
 *   WILL  take the `recruitment.review.completed` AUDIT ROW as the entry point,
 *         require outcome COMPLETED, require the named `AtsAiReview` to exist,
 *         require the review's application to be in this same organization,
 *         require the application's `aiReviewCycle` to equal the review's cycle,
 *         and then move AI_REVIEW_PENDING or APPLIED → PENDING_HUMAN_APPROVAL
 *         with a conditional UPDATE, a pipeline event and an audit row, in one
 *         transaction.
 *   WILL NOT touch an application in any other status (so a human who already
 *         decided always wins), will not cross an organization boundary, will
 *         not create, delete or anonymise anything, will not record a decision,
 *         and will not write at all unless `commit` is true.
 *
 * IDEMPOTENCE. Eligibility is a property of the CURRENT row: once an
 * application is PENDING_HUMAN_APPROVAL it is reported `ALREADY_AT_GATE` and
 * skipped. A second run over the same data therefore writes nothing. The
 * conditional UPDATE repeats the precondition inside the transaction, so a
 * concurrent human decision between the scan and the write loses the race and
 * is reported `RACE_LOST` rather than overwritten.
 *
 * ACTOR. `recruitment.application.status_transition` is a HUMAN action in
 * `recruitment-audit.ts`, so a repair must name the operator who ran it. There
 * is no system actor for this: a reconciliation is somebody's decision.
 */

import { getPrisma } from "@/lib/db/prisma";
import { buildRecruitmentAuditCreate } from "./recruitment-audit";

/** The only statuses a repair may move FROM. Anything else is left alone. */
export const RECONCILABLE_FROM = ["AI_REVIEW_PENDING", "APPLIED"] as const;
export const RECONCILE_TO = "PENDING_HUMAN_APPROVAL";
export const DEFAULT_RECONCILE_LIMIT = 100;
export const MAX_RECONCILE_LIMIT = 1000;

export type SkipReason =
  | "REVIEW_MISSING"
  | "REVIEW_TENANT_MISMATCH"
  | "APPLICATION_MISSING"
  | "APPLICATION_ID_MISMATCH"
  | "APPLICATION_ERASED"
  | "CYCLE_MISMATCH"
  | "ALREADY_AT_GATE"
  | "NOT_ELIGIBLE"
  | "RACE_LOST"
  | "WRITE_FAILED";

export interface ReconcileItem {
  organizationId: string;
  auditLogId: string;
  reviewId: string;
  applicationId: string | null;
  /** The status the application held when it was scanned. */
  fromStatus: string | null;
  cycle: number | null;
  /** True when this row would be (or was) moved to PENDING_HUMAN_APPROVAL. */
  eligible: boolean;
  /** Present exactly when `eligible` is false, or when a write did not land. */
  skipped: SkipReason | null;
  /** True only when `commit` was set AND the conditional update matched. */
  applied: boolean;
}

export interface ReconcileReport {
  /** False when nothing was written, which is the default. */
  committed: boolean;
  scanned: number;
  eligible: number;
  applied: number;
  skipped: number;
  storeUnavailable: boolean;
  items: ReconcileItem[];
}

interface AuditRow {
  id: string;
  organizationId: string | null;
  entityId: string | null;
  outcome: string | null;
  correlationId: string | null;
  metadata: unknown;
}

interface ReviewRow {
  id: string;
  organizationId: string;
  applicationId: string;
  cycle: number;
}

interface AppRow {
  id: string;
  organizationId: string;
  status: string;
  aiReviewCycle: number;
  deletedAt: Date | null;
  anonymizedAt: Date | null;
}

type Tx = {
  atsApplication: { updateMany: (a: unknown) => Promise<{ count: number }> };
  atsPipelineEvent: { create: (a: unknown) => Promise<unknown> };
  auditLog: { create: (a: unknown) => Promise<unknown> };
};

type Client = {
  auditLog: { findMany: (a: unknown) => Promise<AuditRow[]> } & Tx["auditLog"];
  atsAiReview: { findFirst: (a: unknown) => Promise<ReviewRow | null> };
  atsApplication: { findFirst: (a: unknown) => Promise<AppRow | null> } & Tx["atsApplication"];
  atsPipelineEvent: Tx["atsPipelineEvent"];
  $transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
};

export interface ReconcileArgs {
  /** Nothing is written unless this is explicitly true. */
  commit?: boolean;
  /** Required when `commit` is true: the operator who takes responsibility. */
  actorUserId?: string | null;
  /** Recorded on the audit row beside the actor. */
  actorRole?: string;
  /** Narrow the scan to one organization, or one application. */
  organizationId?: string;
  applicationId?: string;
  limit?: number;
  now?: Date;
  /** A written reason, recorded verbatim in the audit row. */
  reason?: string;
}

function readMetadataApplicationId(metadata: unknown): string | null {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const after = (metadata as { after?: unknown }).after;
  if (after === null || typeof after !== "object" || Array.isArray(after)) return null;
  const id = (after as { applicationId?: unknown }).applicationId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Scan, and optionally repair. Returns a report that names every row it looked
 * at and why it did or did not act, so a dry run is a reviewable artefact
 * rather than a promise.
 */
export async function reconcileReviewStage(args: ReconcileArgs = {}): Promise<ReconcileReport> {
  const empty: ReconcileReport = {
    committed: false,
    scanned: 0,
    eligible: 0,
    applied: 0,
    skipped: 0,
    storeUnavailable: false,
    items: [],
  };
  const commit = args.commit === true;
  const now = args.now ?? new Date();
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_RECONCILE_LIMIT, 1), MAX_RECONCILE_LIMIT);
  const reason =
    args.reason?.trim() ||
    "reconciliation: a COMPLETED AI review existed while the application was still behind the stage gate";

  if (commit && !args.actorUserId) {
    throw new Error("a commit run requires actorUserId: this transition is a human action");
  }

  const prisma = (await getPrisma()) as unknown as Client | null;
  if (!prisma) return { ...empty, storeUnavailable: true };

  const rows = await prisma.auditLog.findMany({
    where: {
      action: "recruitment.review.completed",
      outcome: "COMPLETED",
      entityType: "AtsAiReview",
      ...(args.organizationId ? { organizationId: args.organizationId } : {}),
    },
    select: { id: true, organizationId: true, entityId: true, outcome: true, correlationId: true, metadata: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const items: ReconcileItem[] = [];

  for (const row of rows) {
    // An audit row without a tenant or a subject proves nothing; it is data,
    // not an instruction, and it is skipped rather than guessed at.
    if (!row.organizationId || !row.entityId) {
      items.push({
        organizationId: row.organizationId ?? "",
        auditLogId: row.id,
        reviewId: row.entityId ?? "",
        applicationId: null,
        fromStatus: null,
        cycle: null,
        eligible: false,
        skipped: "REVIEW_MISSING",
        applied: false,
      });
      continue;
    }
    const organizationId = row.organizationId;
    const reviewId = row.entityId;
    const base = {
      organizationId,
      auditLogId: row.id,
      reviewId,
      applicationId: null as string | null,
      fromStatus: null as string | null,
      cycle: null as number | null,
      eligible: false,
      skipped: null as SkipReason | null,
      applied: false,
    };

    // The REVIEW ROW is the authority, not the audit metadata. The audit only
    // points at it; everything that drives a write is read from the row.
    const review = await prisma.atsAiReview.findFirst({
      where: { id: reviewId, organizationId },
      select: { id: true, organizationId: true, applicationId: true, cycle: true },
    });
    if (!review) {
      items.push({ ...base, skipped: "REVIEW_MISSING" });
      continue;
    }
    if (review.organizationId !== organizationId) {
      items.push({ ...base, skipped: "REVIEW_TENANT_MISMATCH" });
      continue;
    }

    // When the audit row carries an applicationId, it must AGREE with the
    // review row. A disagreement is a data problem for a human, not something
    // to resolve by preferring one source.
    const claimed = readMetadataApplicationId(row.metadata);
    if (claimed && claimed !== review.applicationId) {
      items.push({ ...base, applicationId: review.applicationId, skipped: "APPLICATION_ID_MISMATCH" });
      continue;
    }
    if (args.applicationId && args.applicationId !== review.applicationId) {
      continue; // outside the requested scope; not a skip, simply not scanned
    }

    const app = await prisma.atsApplication.findFirst({
      where: { id: review.applicationId, organizationId },
      select: { id: true, organizationId: true, status: true, aiReviewCycle: true, deletedAt: true, anonymizedAt: true },
    });
    const withApp = { ...base, applicationId: review.applicationId, cycle: review.cycle };
    if (!app) {
      items.push({ ...withApp, skipped: "APPLICATION_MISSING" });
      continue;
    }
    if (app.deletedAt !== null || app.anonymizedAt !== null) {
      items.push({ ...withApp, fromStatus: app.status, skipped: "APPLICATION_ERASED" });
      continue;
    }
    if (app.aiReviewCycle !== review.cycle) {
      // A later cycle means the application was returned for re-review; an old
      // review must never drag it back to the gate.
      items.push({ ...withApp, fromStatus: app.status, skipped: "CYCLE_MISMATCH" });
      continue;
    }
    if (app.status === RECONCILE_TO) {
      items.push({ ...withApp, fromStatus: app.status, skipped: "ALREADY_AT_GATE" });
      continue;
    }
    if (!(RECONCILABLE_FROM as readonly string[]).includes(app.status)) {
      items.push({ ...withApp, fromStatus: app.status, skipped: "NOT_ELIGIBLE" });
      continue;
    }

    // Captured BEFORE the transaction. The event and the audit row must record
    // the status this pass actually observed and conditioned its UPDATE on —
    // never whatever the row holds afterwards.
    const fromStatus = app.status;
    const fromCycle = app.aiReviewCycle;
    const eligible = { ...withApp, fromStatus, eligible: true };
    if (!commit) {
      items.push(eligible);
      continue;
    }

    try {
      const moved = await prisma.$transaction(async (tx) => {
        // The precondition, repeated inside the transaction. Zero rows means a
        // human acted between the scan and now — and they win.
        const updated = await tx.atsApplication.updateMany({
          where: {
            id: app.id,
            organizationId,
            status: fromStatus,
            aiReviewCycle: review.cycle,
          },
          data: { status: RECONCILE_TO },
        });
        if (updated.count !== 1) return false;

        await tx.atsPipelineEvent.create({
          data: {
            organizationId,
            applicationId: app.id,
            fromStatus,
            toStatus: RECONCILE_TO,
            changedById: args.actorUserId ?? null,
            changedByName: "OPERATOR_RECONCILIATION",
            notes: `reconciled:ai_review:${review.id} cycle=${review.cycle}`,
          },
        });
        await tx.auditLog.create(
          buildRecruitmentAuditCreate({
            action: "recruitment.application.status_transition",
            entityType: "AtsApplication",
            entityId: app.id,
            userId: args.actorUserId ?? null,
            organizationId,
            correlationId: row.correlationId ?? undefined,
            metadata: {
              reason,
              before: { status: fromStatus, cycle: fromCycle },
              after: {
                status: RECONCILE_TO,
                aiReviewId: review.id,
                cycle: review.cycle,
                sourceAuditLogId: row.id,
                actorRole: args.actorRole ?? "OPERATOR",
                reconciledAt: now.toISOString(),
              },
              stage: "S1",
            },
          }),
        );
        return true;
      });
      items.push(moved ? { ...eligible, applied: true } : { ...eligible, eligible: false, skipped: "RACE_LOST" });
    } catch {
      items.push({ ...eligible, eligible: false, skipped: "WRITE_FAILED" });
    }
  }

  const eligibleCount = items.filter((i) => i.eligible).length;
  return {
    committed: commit,
    scanned: items.length,
    eligible: eligibleCount,
    applied: items.filter((i) => i.applied).length,
    skipped: items.filter((i) => i.skipped !== null).length,
    storeUnavailable: false,
    items,
  };
}
