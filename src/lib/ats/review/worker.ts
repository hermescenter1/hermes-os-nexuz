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
import { acquireLease, defaultHolder, releaseLease } from "@/lib/industrial/metering-worker";
import { buildRecruitmentAuditCreate } from "../recruitment-audit";
import { reviewApplication, type AdvisoryProvider, type StoredCriterion } from "./engine";
import { readSettingsOrDefaults, type SettingsReader } from "../settings/defaults";
import { AI_REVIEW_OUTBOX_KIND } from "../intake";

export const MAX_REVIEW_ATTEMPTS = 5;
export const backoffMs = (attempt: number) => attempt * attempt * 1_000;
export const DEFAULT_REVIEW_BATCH = 20;
export const MAX_REVIEW_BATCH = 100;

/**
 * The job's row in the platform's generic `WorkerLease` table — the same lease
 * the metering worker takes under its own name (Phase 109-C-UI.2-R8). Reused,
 * not re-implemented: `acquireLease`/`releaseLease` already take a job name,
 * and `WorkerLease` is keyed by it, so no schema change is needed.
 *
 * Two guarantees stack, exactly as for metering. The lease means one replica
 * sweeps at a time, so `--scale hermes-ats-review-worker=N` does not multiply
 * reviews. The conditional per-row claim below means that even if the lease is
 * lost mid-pass, no outbox row is reviewed twice.
 */
export const ATS_REVIEW_LEASE_NAME = "ats.review.outbox";

export interface ReviewPassReport {
  /** False when another replica holds the lease; the pass then touches nothing. */
  acquired: boolean;
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
type Client = Tx & SettingsReader & {
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
  holder?: string;
}): Promise<ReviewPassReport> {
  const report: ReviewPassReport = { acquired: false, claimed: 0, delivered: 0, retrying: 0, deadLettered: 0, skipped: 0, storeUnavailable: false };
  const now = opts?.now ?? new Date();
  const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_REVIEW_BATCH, 1), MAX_REVIEW_BATCH);

  const prisma = (await getPrisma()) as unknown as Client | null;
  if (!prisma) return { ...report, storeUnavailable: true };

  const handle = await acquireLease({
    holder: opts?.holder ?? defaultHolder(),
    client: prisma,
    nowMs: now.getTime(),
    name: ATS_REVIEW_LEASE_NAME,
  });
  // Another replica is sweeping. Not an error, and nothing is touched.
  if (!handle) return report;

  try {
    return await deliverDueReviews(prisma, now, limit, opts?.advisory, { ...report, acquired: true });
  } finally {
    // Released on every path, including a throw, so a crashed pass does not
    // park the job for the full lease TTL (same rule as the metering pass).
    await releaseLease({ handle, client: prisma, nowMs: now.getTime(), name: ATS_REVIEW_LEASE_NAME }).catch(() => false);
  }
}

async function deliverDueReviews(
  prisma: Client,
  now: Date,
  limit: number,
  advisory: AdvisoryProvider | undefined,
  report: ReviewPassReport,
): Promise<ReviewPassReport> {
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

    // ATS-M1 — the application's ORGANIZATION policy, read per row (a pass can
    // span organizations). A failed read retries the row later rather than
    // reviewing without the policy: the review never runs on a guessed policy.
    let orgPolicy: { externalAiAllowed: boolean; minimumConfidence: number | null };
    try {
      const settings = await readSettingsOrDefaults(prisma, row.organizationId);
      orgPolicy = {
        externalAiAllowed: settings.aiProviderMode === "router" && settings.externalAiProcessingEnabled,
        minimumConfidence: settings.minimumConfidence,
      };
    } catch {
      await fail("SETTINGS_UNAVAILABLE");
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
      { now, advisory, policy: orgPolicy },
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
