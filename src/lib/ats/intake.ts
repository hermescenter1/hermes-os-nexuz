/**
 * ATS-B2 — public application intake orchestration.
 *
 * This is the module Stage B1 said did not exist
 * (`APPLICATION_ORCHESTRATION_IMPLEMENTED = NO`). It joins the utilities B1
 * shipped — the strict schema, the payload-bound idempotency claim, the shared
 * public-eligibility predicate, the typed consent records — into ONE ordered,
 * transactional path:
 *
 *   1. the fingerprint secret must exist (no secret → refuse, WRITE_COUNT=0);
 *   2. the job must be publicly eligible NOW;
 *   3. the organization must hold an APPROVED, enabled RetentionPolicy for
 *      RECRUITMENT_CANDIDATE with a real retentionDays — the retention period
 *      is READ from that row, never invented here;
 *   4. the idempotency key is claimed ATOMICALLY against the payload
 *      fingerprint (replay → the same reference, no write; mismatch → refuse);
 *   5. inside ONE transaction: eligibility and policy are re-checked; the
 *      candidate is found by e-mail or created; a duplicate application for
 *      (job, candidate) is detected BEFORE any write and answered with the
 *      existing reference; otherwise application + typed consents + two
 *      pipeline events (APPLIED, then AI_REVIEW_PENDING) + the review outbox
 *      row + the audit row are written together;
 *   6. the claim is completed with the public reference, or released so a
 *      retry can try again.
 *
 * NEVER AUTO-ADVANCE. The intake ends at AI_REVIEW_PENDING. Only the review
 * worker moves an application to PENDING_HUMAN_APPROVAL, and only a recorded
 * human decision moves it further.
 *
 * NO PII LEAVES THIS MODULE except into the rows that are meant to hold it.
 * Outcomes are codes; the audit row carries identifiers only; nothing here
 * logs.
 */

import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/db/prisma";
import { publicJobWhere } from "./eligibility";
import { RECRUITMENT_DATA_CLASS, durableApplicationFields, type Stage1Application } from "./application";
import {
  canonicalizePayload,
  claimIdempotencyKey,
  completeIdempotencyClaim,
  fingerprintPayload,
  releaseIdempotencyClaim,
} from "./idempotency";
import { buildRecruitmentAuditCreate } from "./recruitment-audit";
import { RECRUITMENT_CONSENT_VERSION, getIdempotencySecret } from "./policy";

export const AI_REVIEW_OUTBOX_KIND = "AI_REVIEW";
export const INTAKE_SOURCE = "careers_portal";

export type IntakeRefusalCode =
  | "SECRET_MISSING"
  | "STORE_UNAVAILABLE"
  | "NOT_ACCEPTING"
  | "RETENTION_NOT_APPROVED"
  | "PAYLOAD_MISMATCH"
  | "PENDING"
  | "CANDIDATE_ERASED"
  | "WRITE_FAILED";

export type IntakeOutcome =
  | { ok: true; reference: string; replay: boolean; duplicate: boolean; applicationId: string | null }
  | { ok: false; code: IntakeRefusalCode };

export interface IntakeArgs {
  app: Stage1Application;
  rawIdempotencyKey: string;
  locale: string;
  correlationId: string;
  now?: Date;
}

interface RetentionPolicyRow {
  id: string;
  retentionDays: number | null;
  retentionTrigger: string;
}

type IntakeTx = {
  atsJob: { findFirst: (a: unknown) => Promise<{ id: string; organizationId: string } | null> };
  retentionPolicy: { findFirst: (a: unknown) => Promise<RetentionPolicyRow | null> };
  atsCandidate: {
    findUnique: (a: unknown) => Promise<{ id: string; deletedAt?: Date | null } | null>;
    create: (a: unknown) => Promise<{ id: string }>;
  };
  atsApplication: {
    findFirst: (a: unknown) => Promise<{ id: string; publicReference: string | null } | null>;
    create: (a: unknown) => Promise<{ id: string }>;
    update: (a: unknown) => Promise<unknown>;
  };
  consentRecord: { create: (a: unknown) => Promise<unknown> };
  atsPipelineEvent: { create: (a: unknown) => Promise<unknown> };
  atsReviewOutbox: { create: (a: unknown) => Promise<unknown> };
  auditLog: { create: (a: unknown) => Promise<unknown> };
};
type IntakeClient = IntakeTx & { $transaction: <T>(fn: (tx: IntakeTx) => Promise<T>) => Promise<T> };

class IntakeRefusal extends Error {
  constructor(public readonly code: IntakeRefusalCode) {
    super(code);
  }
}

/** Opaque, random, URL-safe. The only identifier an applicant ever sees. */
export function newPublicReference(): string {
  return `ats_${randomBytes(16).toString("base64url")}`;
}

/** Storage form of an e-mail for deduplication: trimmed, lower-cased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function approvedPolicyWhere(organizationId: string) {
  return {
    organizationId,
    dataClass: RECRUITMENT_DATA_CLASS,
    approvalState: "APPROVED",
    enabled: true,
    retentionDays: { not: null },
  } as const;
}

/**
 * The retention expiry stamped at intake. CREATION-triggered and
 * LAST_ACTIVITY-triggered policies both start from the intake moment here;
 * the retention service re-evaluates LAST_ACTIVITY from `updatedAt` at sweep
 * time, so this stamp is a floor, never the only check.
 */
export function retentionExpiryFrom(policy: RetentionPolicyRow, now: Date): Date | null {
  if (typeof policy.retentionDays !== "number" || !Number.isFinite(policy.retentionDays) || policy.retentionDays <= 0) {
    return null;
  }
  return new Date(now.getTime() + policy.retentionDays * 86_400_000);
}

const isUniqueViolation = (e: unknown): boolean => (e as { code?: unknown })?.code === "P2002";

export async function submitApplication(args: IntakeArgs): Promise<IntakeOutcome> {
  const now = args.now ?? new Date();
  const { app } = args;

  const secret = getIdempotencySecret();
  if (!secret) return { ok: false, code: "SECRET_MISSING" };

  const prisma = (await getPrisma()) as unknown as IntakeClient | null;
  if (!prisma) return { ok: false, code: "STORE_UNAVAILABLE" };

  // ── Pre-transaction gates. All read-only; a refusal here writes nothing. ──
  let job: { id: string; organizationId: string } | null;
  try {
    job = await prisma.atsJob.findFirst({
      where: { id: app.jobId, ...publicJobWhere(now) },
      select: { id: true, organizationId: true },
    });
  } catch {
    return { ok: false, code: "STORE_UNAVAILABLE" };
  }
  if (!job) return { ok: false, code: "NOT_ACCEPTING" };
  const organizationId = job.organizationId;

  let policy: RetentionPolicyRow | null;
  try {
    policy = await prisma.retentionPolicy.findFirst({
      where: approvedPolicyWhere(organizationId),
      select: { id: true, retentionDays: true, retentionTrigger: true },
    });
  } catch {
    return { ok: false, code: "STORE_UNAVAILABLE" };
  }
  const retentionExpiresAt = policy ? retentionExpiryFrom(policy, now) : null;
  if (!policy || !retentionExpiresAt) return { ok: false, code: "RETENTION_NOT_APPROVED" };

  // ── Atomic idempotency claim, bound to the durable payload only. ──
  const payloadHash = fingerprintPayload(canonicalizePayload(durableApplicationFields(app)), secret);
  const claim = await claimIdempotencyKey({
    organizationId,
    jobId: job.id,
    rawKey: args.rawIdempotencyKey,
    payloadHash,
    now,
  });
  switch (claim.outcome) {
    case "REPLAY":
      return claim.resultId
        ? { ok: true, reference: claim.resultId, replay: true, duplicate: false, applicationId: null }
        : { ok: false, code: "PENDING" };
    case "PAYLOAD_MISMATCH":
      return { ok: false, code: "PAYLOAD_MISMATCH" };
    case "PENDING":
      return { ok: false, code: "PENDING" };
    case "STORE_UNAVAILABLE":
      return { ok: false, code: "STORE_UNAVAILABLE" };
    case "CLAIMED":
      break;
  }
  const claimId = claim.claimId;

  // ── The write, all or nothing. ──
  const email = normalizeEmail(app.email);
  const policyId = policy.id;

  let result: { applicationId: string | null; reference: string; duplicate: boolean };
  try {
    result = await prisma.$transaction(async (tx) => {
      // Re-check under the transaction: the job may have closed, the policy
      // may have been revoked, between the pre-check and now.
      const jobNow = await tx.atsJob.findFirst({
        where: { id: app.jobId, organizationId, ...publicJobWhere(now) },
        select: { id: true, organizationId: true },
      });
      if (!jobNow) throw new IntakeRefusal("NOT_ACCEPTING");
      const policyNow = await tx.retentionPolicy.findFirst({
        where: { ...approvedPolicyWhere(organizationId), id: policyId },
        select: { id: true, retentionDays: true, retentionTrigger: true },
      });
      if (!policyNow || !retentionExpiryFrom(policyNow, now)) throw new IntakeRefusal("RETENTION_NOT_APPROVED");

      // Candidate identity is GLOBAL (one person, one e-mail); the application
      // is the tenant-scoped record. Nothing about the candidate row is
      // returned to the caller beyond what this organization's own
      // application legitimately carries.
      // Looked up WITHOUT a deletedAt filter on purpose. `email` is globally
      // unique, so a soft-deleted (erased) row still owns the address: filtering
      // it out would make it "not found", the create below would then hit the
      // unique constraint, and that person would get a generic refusal forever
      // with nothing recorded about why. An erased identity is not silently
      // resurrected either — it is refused by name, for an operator to resolve
      // through the Phase 97 erasure workflow.
      const found = await tx.atsCandidate.findUnique({
        where: { email },
        select: { id: true, deletedAt: true },
      });
      if (found?.deletedAt) throw new IntakeRefusal("CANDIDATE_ERASED");
      const existingCandidate = found ? { id: found.id } : null;
      const candidate =
        existingCandidate ??
        (await tx.atsCandidate.create({
          data: {
            email,
            name: app.fullName,
            phone: app.phone ?? null,
            location: app.currentLocation ?? null,
            linkedinUrl: app.linkedinUrl ?? null,
            skills: app.keySkills ?? [],
            // NOT collected in Stage 1 — never fabricated.
            workAuthorization: null,
          },
          select: { id: true },
        }));

      // Duplicate detection BEFORE any application write, so the transaction
      // never has to survive a unique violation. The answer is the existing
      // reference — the applicant learns nothing they did not already know.
      const existingApplication = await tx.atsApplication.findFirst({
        where: { organizationId, jobId: job.id, candidateId: candidate.id, deletedAt: null },
        select: { id: true, publicReference: true },
      });
      if (existingApplication) {
        let reference = existingApplication.publicReference;
        if (!reference) {
          // A pre-B2 row without a reference: issue one now, additively.
          reference = newPublicReference();
          await tx.atsApplication.update({
            where: { id: existingApplication.id },
            data: { publicReference: reference },
          });
        }
        await tx.auditLog.create(
          buildRecruitmentAuditCreate({
            action: "recruitment.application.duplicate_replayed",
            entityType: "AtsApplication",
            entityId: existingApplication.id,
            userId: null,
            organizationId,
            correlationId: args.correlationId,
            metadata: {
              reason: "public intake matched an existing application for the same job and candidate; no new row",
              before: null,
              after: { jobId: job.id, duplicate: true },
              stage: "B2",
              actor: "SYSTEM_PUBLIC_INTAKE",
            },
          }),
        );
        return { applicationId: null, reference, duplicate: true };
      }

      const reference = newPublicReference();
      const application = await tx.atsApplication.create({
        data: {
          organizationId,
          jobId: job.id,
          candidateId: candidate.id,
          status: "APPLIED",
          resumeText: app.resumeText ?? null,
          coverLetter: app.fitStatement ?? null,
          totalYearsExp: app.yearsExperience ?? null,
          source: INTAKE_SOURCE,
          publicReference: reference,
          consentVersion: RECRUITMENT_CONSENT_VERSION,
          retentionPolicyId: policyNow.id,
          retentionExpiresAt,
          intakeCorrelationId: args.correlationId,
          aiReviewCycle: 0,
        },
        select: { id: true },
      });

      // The three typed records. None of them alone is a lawful basis; the
      // genuinely optional consent is stored ONLY when it was actually given.
      const base = {
        candidateId: candidate.id,
        organizationId,
        consentVersion: RECRUITMENT_CONSENT_VERSION,
        locale: args.locale,
      };
      await tx.consentRecord.create({
        data: {
          ...base,
          consentType: "recruitment_privacy_notice",
          recordNature: "ACKNOWLEDGEMENT",
          granted: true,
          metadata: { purpose: "recruitment", applicationId: application.id },
        },
      });
      await tx.consentRecord.create({
        data: {
          ...base,
          consentType: "recruitment_accuracy",
          recordNature: "ATTESTATION",
          granted: true,
          metadata: { purpose: "recruitment", applicationId: application.id },
        },
      });
      if (app.futureOpeningsConsent === true) {
        await tx.consentRecord.create({
          data: {
            ...base,
            consentType: "recruitment_future_openings",
            recordNature: "CONSENT",
            granted: true,
            metadata: { purpose: "talent_pool", applicationId: application.id },
          },
        });
      }

      // Received, then queued — two facts, two events, one transaction.
      await tx.atsPipelineEvent.create({
        data: {
          organizationId,
          applicationId: application.id,
          fromStatus: null,
          toStatus: "APPLIED",
          changedById: null,
          changedByName: "SYSTEM_PUBLIC_INTAKE",
          notes: `received:${INTAKE_SOURCE}`,
        },
      });
      await tx.atsApplication.update({
        where: { id: application.id },
        data: { status: "AI_REVIEW_PENDING" },
      });
      await tx.atsPipelineEvent.create({
        data: {
          organizationId,
          applicationId: application.id,
          fromStatus: "APPLIED",
          toStatus: "AI_REVIEW_PENDING",
          changedById: null,
          changedByName: "SYSTEM_PUBLIC_INTAKE",
          notes: "queued:ai_review cycle=0",
        },
      });
      await tx.atsReviewOutbox.create({
        data: {
          organizationId,
          applicationId: application.id,
          kind: AI_REVIEW_OUTBOX_KIND,
          cycle: 0,
          status: "PENDING",
          correlationId: args.correlationId,
        },
      });
      await tx.auditLog.create(
        buildRecruitmentAuditCreate({
          action: "recruitment.application.received",
          entityType: "AtsApplication",
          entityId: application.id,
          userId: null,
          organizationId,
          correlationId: args.correlationId,
          metadata: {
            reason: "public intake via POST /api/careers/apply",
            before: null,
            after: {
              status: "AI_REVIEW_PENDING",
              jobId: job.id,
              cycle: 0,
              retentionPolicyId: policyNow.id,
              consentVersion: RECRUITMENT_CONSENT_VERSION,
            },
            stage: "B2",
            actor: "SYSTEM_PUBLIC_INTAKE",
          },
        }),
      );

      return { applicationId: application.id, reference, duplicate: false };
    });
  } catch (err) {
    await releaseIdempotencyClaim(claimId);
    if (err instanceof IntakeRefusal) return { ok: false, code: err.code };
    if (isUniqueViolation(err)) {
      // Lost a race on (jobId, candidateId) between the pre-check and the
      // insert. The other writer's row is the answer; nothing more to write.
      return { ok: false, code: "PENDING" };
    }
    return { ok: false, code: "WRITE_FAILED" };
  }

  await completeIdempotencyClaim(claimId, result.reference);
  return {
    ok: true,
    reference: result.reference,
    replay: false,
    duplicate: result.duplicate,
    applicationId: result.applicationId,
  };
}
