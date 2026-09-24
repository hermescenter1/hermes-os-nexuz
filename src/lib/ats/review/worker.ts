/**
 * ATS-S1 — the AI review worker: outbox → review → PENDING_HUMAN_APPROVAL.
 *
 * Mirrors the metering outbox (Phase 109-C-UI.2-R7): a conditional status
 * claim per row, one transaction per delivery, bounded retries with quadratic
 * backoff, a dead-letter state, and nothing dropped silently.
 *
 * WHAT IT MAY AND MAY NOT DO
 *   MAY   move an application from AI_REVIEW_PENDING to PENDING_HUMAN_APPROVAL
 *         — and ONLY that transition, ONLY from that state, ONLY for the
 *         review cycle the outbox row names (a conditional UPDATE, so a human
 *         who acted first wins and the worker's write matches zero rows).
 *   MAY NOT move an application anywhere else. There is no code path here
 *         that writes SCREENING, REJECTED or any later status.
 *
 * A review that cannot be produced — no criteria on the job, an unknown role,
 * an invalid report, a store fault — leaves the application exactly where it
 * was: AI_REVIEW_PENDING, a stable and visible state. The outbox row records
 * the failure code and either retries later or dead-letters after
 * MAX_REVIEW_ATTEMPTS.
 */

import { getPrisma } from "@/lib/db/prisma";
import { buildRecruitmentAuditCreate } from "../recruitment-audit";
import { reviewApplication, type AdvisoryProvider, type StoredCriterion } from "./engine";
import { AI_REVIEW_OUTBOX_KIND } from "../intake";

export const MAX_REVIEW_ATTEMPTS = 5;
export const backoffMs = (attempt: number) => attempt * attempt * 1_000;
export const DEFAULT_REVIEW_BATCH = 20;
export const MAX_REVIEW_BATCH = 100;

export interface ReviewPassReport {
  claimed: number;
  delivered: number;
  retrying: number;
  deadLettered: number;
  skipped: number;
  storeUnavailable: boolean;
}

interface OutboxRow {
  id: string;
  organizationId: string;
  applicationId: string;
  cycle: number;
  attempts: number;
  correlationId: string | null;
}

interface LoadedApplication {
  id: string;
  status: string;
  jobId: string;
  aiReviewCycle: number;
  resumeText: string | null;
  coverLetter: string | null;
  totalYearsExp: number | null;
  candidate: { skills: unknown; location: string | null; linkedinUrl: string | null } | null;
  job: { title: string; criteria: StoredCriterion[] } | null;
}

type Tx = {
  atsAiReview: { create: (a: unknown) => Promise<{ id: string }> };
  atsApplication: { updateMany: (a: unknown) => Promise<{ count: number }> };
  atsPipelineEvent: { create: (a: unknown) => Promise<unknown> };
  atsReviewOutbox: { updateMany: (a: unknown) => Promise<{ count: number }> };
  auditLog: { create: (a: unknown) => Promise<unknown> };
};
type Client = Tx & {
  atsReviewOutbox: Tx["atsReviewOutbox"] & { findMany: (a: unknown) => Promise<OutboxRow[]> };
  atsApplication: Tx["atsApplication"] & { findFirst: (a: unknown) => Promise<LoadedApplication | null> };
  $transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
};

class StaleState extends Error {
  constructor() {
    super("STALE_STATE");
  }
}

export async function runAiReviewPass(opts?: {
  limit?: number;
  now?: Date;
  advisory?: AdvisoryProvider;
}): Promise<ReviewPassReport> {
  const report: ReviewPassReport = { claimed: 0, delivered: 0, retrying: 0, deadLettered: 0, skipped: 0, storeUnavailable: false };
  const now = opts?.now ?? new Date();
  const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_REVIEW_BATCH, 1), MAX_REVIEW_BATCH);

  const prisma = (await getPrisma()) as unknown as Client | null;
  if (!prisma) return { ...report, storeUnavailable: true };

  const due = await prisma.atsReviewOutbox.findMany({
    where: { kind: AI_REVIEW_OUTBOX_KIND, status: { in: ["PENDING", "RETRYING"] }, nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true, organizationId: true, applicationId: true, cycle: true, attempts: true, correlationId: true },
  });

  for (const row of due) {
    // The claim IS the lock: two workers race here and the loser matches zero rows.
    const claim = await prisma.atsReviewOutbox.updateMany({
      where: { id: row.id, status: { in: ["PENDING", "RETRYING"] } },
      data: { status: "CLAIMED", claimedAt: now, attempts: { increment: 1 } },
    });
    if (claim.count === 0) {
      report.skipped++;
      continue;
    }
    report.claimed++;
    const attempt = row.attempts + 1;

    const fail = async (code: string) => {
      const dead = attempt >= MAX_REVIEW_ATTEMPTS;
      await prisma.atsReviewOutbox.updateMany({
        where: { id: row.id, status: "CLAIMED" },
        data: dead
          ? { status: "DEAD_LETTER", lastErrorCode: code }
          : { status: "RETRYING", lastErrorCode: code, nextAttemptAt: new Date(now.getTime() + backoffMs(attempt)) },
      });
      if (dead) report.deadLettered++;
      else report.retrying++;
      try {
        await prisma.auditLog.create(
          buildRecruitmentAuditCreate({
            action: "recruitment.review.failed",
            entityType: "AtsApplication",
            entityId: row.applicationId,
            userId: null,
            organizationId: row.organizationId,
            correlationId: row.correlationId ?? undefined,
            metadata: {
              reason: `AI review attempt ${attempt} failed with ${code}; application remains AI_REVIEW_PENDING`,
              before: { status: "AI_REVIEW_PENDING", cycle: row.cycle },
              after: { status: "AI_REVIEW_PENDING", outbox: dead ? "DEAD_LETTER" : "RETRYING", code },
              stage: "S1",
              actor: "SYSTEM_REVIEW_WORKER",
            },
          }),
        );
      } catch {
        /* the outbox row already carries the failure; audit is best-effort here */
      }
    };

    // Tenant-scoped load: the row's organizationId is part of the predicate.
    let app: LoadedApplication | null;
    try {
      app = await prisma.atsApplication.findFirst({
        where: { id: row.applicationId, organizationId: row.organizationId, deletedAt: null },
        select: {
          id: true,
          status: true,
          jobId: true,
          aiReviewCycle: true,
          resumeText: true,
          coverLetter: true,
          totalYearsExp: true,
          candidate: { select: { skills: true, location: true, linkedinUrl: true } },
          job: {
            select: {
              title: true,
              criteria: {
                select: { code: true, label: true, kind: true, dimension: true, weight: true, keywords: true, minYears: true, hardGate: true },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      });
    } catch {
      await fail("LOAD_FAILED");
      continue;
    }
    if (!app) {
      await fail("APPLICATION_NOT_FOUND");
      continue;
    }
    if (app.status !== "AI_REVIEW_PENDING" || app.aiReviewCycle !== row.cycle) {
      // A human acted first (returned / rejected) or this row is from an older
      // cycle. Nothing to review; dead-letter with a code that says why.
      await prisma.atsReviewOutbox.updateMany({
        where: { id: row.id, status: "CLAIMED" },
        data: { status: "DEAD_LETTER", lastErrorCode: "APPLICATION_NOT_PENDING" },
      });
      report.deadLettered++;
      continue;
    }

    const skills = Array.isArray(app.candidate?.skills)
      ? (app.candidate!.skills as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    const outcome = await reviewApplication(
      {
        resumeText: app.resumeText,
        fitStatement: app.coverLetter,
        keySkills: skills,
        yearsExperience: app.totalYearsExp,
        currentLocation: app.candidate?.location ?? null,
        linkedinUrl: app.candidate?.linkedinUrl ?? null,
        criteria: app.job?.criteria ?? [],
        roleTitle: app.job?.title ?? "",
      },
      { now, advisory: opts?.advisory },
    );
    if (!outcome.ok) {
      await fail(outcome.code);
      continue;
    }
    const { report: r } = outcome;

    try {
      await prisma.$transaction(async (tx) => {
        const review = await tx.atsAiReview.create({
          data: {
            organizationId: row.organizationId,
            applicationId: app.id,
            jobId: app.jobId,
            cycle: row.cycle,
            provider: outcome.provider,
            extractorVersion: r.extractorVersion,
            rubricVersion: r.rubricVersion,
            promptVersion: r.promptVersion,
            policyVersion: r.policyVersion,
            modelVersion: outcome.modelVersion,
            recommendation: r.recommendation,
            overallScore: r.overallScore,
            confidence: r.confidence,
            hardGatesPassed: r.hardGates.filter((g) => g.outcome === "PASS").length,
            hardGatesFailed: r.hardGates.filter((g) => g.outcome === "FAIL").length,
            hardGatesUnknown: r.hardGates.filter((g) => g.outcome === "UNKNOWN").length,
            riskFlagCount: r.riskFlags.length,
            report: r,
            correlationId: row.correlationId,
          },
          select: { id: true },
        });

        // THE ONLY transition this worker performs, and it is conditional on
        // the state it read. Zero rows means someone else moved first.
        const moved = await tx.atsApplication.updateMany({
          where: { id: app.id, organizationId: row.organizationId, status: "AI_REVIEW_PENDING", aiReviewCycle: row.cycle },
          data: {
            status: "PENDING_HUMAN_APPROVAL",
            jobCriteriaSnapshot: { roleCode: r.roleCode, criteria: app.job?.criteria ?? [] },
          },
        });
        if (moved.count !== 1) throw new StaleState();

        await tx.atsPipelineEvent.create({
          data: {
            organizationId: row.organizationId,
            applicationId: app.id,
            fromStatus: "AI_REVIEW_PENDING",
            toStatus: "PENDING_HUMAN_APPROVAL",
            changedById: null,
            changedByName: "SYSTEM_REVIEW_WORKER",
            notes: `ai_review:${review.id} recommendation=${r.recommendation} cycle=${row.cycle}`,
          },
        });
        const delivered = await tx.atsReviewOutbox.updateMany({
          where: { id: row.id, status: "CLAIMED" },
          data: { status: "DELIVERED", deliveredAt: now, aiReviewId: review.id, lastErrorCode: null },
        });
        if (delivered.count !== 1) throw new StaleState();

        await tx.auditLog.create(
          buildRecruitmentAuditCreate({
            action: "recruitment.review.completed",
            entityType: "AtsAiReview",
            entityId: review.id,
            userId: null,
            organizationId: row.organizationId,
            correlationId: row.correlationId ?? undefined,
            metadata: {
              reason: "AI review produced an evidence report; application now awaits a human decision",
              before: { status: "AI_REVIEW_PENDING", cycle: row.cycle },
              after: {
                status: "PENDING_HUMAN_APPROVAL",
                applicationId: app.id,
                recommendation: r.recommendation,
                overallScore: r.overallScore,
                confidence: r.confidence,
                provider: outcome.provider,
                versions: { extractor: r.extractorVersion, rubric: r.rubricVersion, prompt: r.promptVersion, policy: r.policyVersion },
              },
              stage: "S1",
              actor: "SYSTEM_REVIEW_WORKER",
            },
          }),
        );
      });
      report.delivered++;
    } catch (e) {
      await fail(e instanceof StaleState ? "STALE_STATE" : "WRITE_FAILED");
    }
  }

  return report;
}
