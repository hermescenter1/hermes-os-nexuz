/**
 * PHASE 104-B1 — application submission: infrastructure only, acceptance OFF.
 *
 * B1.1 TRUTH FLAGS — what exists here and what does NOT:
 *
 *   APPLICATION_ORCHESTRATION_IMPLEMENTED = NO
 *   B2_REQUIRED                           = YES
 *
 * This module carries submission UTILITIES: a strict Stage-1 schema, the
 * durable-field selector, the retention gate and a transactional persist
 * helper. It does NOT orchestrate an application — nothing here claims the
 * idempotency key, binds the payload fingerprint, re-checks job eligibility
 * inside the write transaction, or completes the claim afterwards. That
 * orchestration is B2 work with no production caller today. In Stage B1 the
 * route never reaches `persistApplication()`:
 *
 *   1. `APPLICATION_ACCEPTANCE_AUTHORIZED` is `false` — a hard, code-level
 *      gate the owner flips in a dedicated change; and
 *   2. `isRetentionPolicyApproved()` requires a RetentionPolicy row for
 *      RECRUITMENT_CANDIDATE that is APPROVED + enabled with a real
 *      retentionDays — which no source or seed file creates.
 *
 * Either gate alone refuses with WRITE_COUNT=0.
 *
 * Stage-1 fields are exactly the A4.2 short set. Work authorization is NOT
 * collected. CV file upload is deferred; only resumeText and an optional link
 * travel. The three consent records are typed by `recordNature`
 * (ACKNOWLEDGEMENT / ATTESTATION / CONSENT) and none of them alone is a
 * lawful basis. Candidate + application + consent records land in ONE
 * transaction, keyed by a payload-bound idempotency claim.
 */

import { z } from "zod";
import { getPrisma } from "@/lib/db/prisma";

/**
 * Owner gate. Flipping it is a deliberate, reviewed change only the owner may
 * authorize (`APPLICATION_ACCEPTANCE_AUTHORIZED=NO`).
 *
 * B1.3 — the constant itself lives in `./acceptance-flag`, which has NO
 * imports, so the public client can read the SAME value without dragging this
 * module's Prisma/pg dependency chain into the browser bundle. Re-exported
 * here so every existing server caller is unchanged.
 */
export { APPLICATION_ACCEPTANCE_AUTHORIZED } from "./acceptance-flag";

export const RECRUITMENT_DATA_CLASS = "RECRUITMENT_CANDIDATE";

/** Stage-1 initial application — the approved short field set, nothing more. */
export const stage1ApplicationSchema = z
  .object({
    jobId: z.string().trim().min(1).max(64),
    fullName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().min(3).max(40).optional(),
    currentLocation: z.string().trim().min(1).max(200).optional(),
    yearsExperience: z.number().int().min(0).max(60).optional(),
    keySkills: z.array(z.string().trim().min(1).max(80)).max(32).optional(),
    resumeText: z.string().trim().min(1).max(20000).optional(),
    fitStatement: z.string().trim().min(1).max(4000).optional(),
    linkedinUrl: z.string().trim().url().max(300).optional(),
    privacyNoticeAcknowledged: z.literal(true),
    accuracyConfirmed: z.literal(true),
    futureOpeningsConsent: z.boolean().optional(),
  })
  .strict();

export type Stage1Application = z.infer<typeof stage1ApplicationSchema>;

/**
 * The fields the idempotency fingerprint binds. Volatile request attributes
 * (IPs, timestamps, correlation ids) are simply never part of this object.
 */
export function durableApplicationFields(app: Stage1Application): Record<string, unknown> {
  return {
    jobId: app.jobId,
    fullName: app.fullName,
    email: app.email,
    phone: app.phone ?? null,
    currentLocation: app.currentLocation ?? null,
    yearsExperience: app.yearsExperience ?? null,
    keySkills: app.keySkills ?? [],
    resumeText: app.resumeText ?? null,
    fitStatement: app.fitStatement ?? null,
    linkedinUrl: app.linkedinUrl ?? null,
    futureOpeningsConsent: app.futureOpeningsConsent ?? false,
  };
}

/**
 * The retention gate: approved + enabled + a real retention period. Absence
 * of proof refuses — an outage is a refusal too, never an acceptance.
 */
export async function isRetentionPolicyApproved(organizationId: string): Promise<boolean> {
  try {
    const prisma = await getPrisma();
    if (!prisma) return false;
    const model = (prisma as unknown as {
      retentionPolicy?: { findFirst?: (a: unknown) => Promise<{ id: string } | null> };
    }).retentionPolicy;
    if (!model?.findFirst) return false;
    const row = await model.findFirst({
      where: {
        organizationId,
        dataClass: RECRUITMENT_DATA_CLASS,
        approvalState: "APPROVED",
        enabled: true,
        retentionDays: { not: null },
      },
      select: { id: true },
    });
    return row !== null;
  } catch {
    return false;
  }
}

export type PersistOutcome =
  | { ok: true; applicationId: string }
  | { ok: false; code: "DUPLICATE" | "STORE_UNAVAILABLE" | "WRITE_FAILED" };

interface PersistArgs {
  organizationId: string;
  app: Stage1Application;
  consentVersion: string;
  locale: string;
}

type ApplyTx = {
  atsCandidate: {
    findUnique: (a: unknown) => Promise<{ id: string } | null>;
    create: (a: unknown) => Promise<{ id: string }>;
  };
  atsApplication: { create: (a: unknown) => Promise<{ id: string }> };
  consentRecord: { create: (a: unknown) => Promise<unknown> };
};
type ApplyClient = { $transaction: <T>(fn: (tx: ApplyTx) => Promise<T>) => Promise<T> };

/**
 * Candidate + application + typed consent records, in ONE transaction.
 * NOT REACHABLE in Stage B1 — both gates above refuse first. It exists so
 * the enablement change is a gate flip, not a rebuild, and so tests can prove
 * the transaction shape today.
 */
export async function persistApplication(args: PersistArgs): Promise<PersistOutcome> {
  const prisma = (await getPrisma()) as unknown as (ApplyClient & ApplyTx) | null;
  if (!prisma) return { ok: false, code: "STORE_UNAVAILABLE" };
  const { app } = args;

  try {
    const applicationId = await prisma.$transaction(async (tx) => {
      const existing = await tx.atsCandidate.findUnique({
        where: { email: app.email },
        select: { id: true },
      });
      const candidate =
        existing ??
        (await tx.atsCandidate.create({
          data: {
            email: app.email,
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

      const application = await tx.atsApplication.create({
        data: {
          organizationId: args.organizationId,
          jobId: app.jobId,
          candidateId: candidate.id,
          status: "APPLIED",
          resumeText: app.resumeText ?? null,
          coverLetter: app.fitStatement ?? null,
          totalYearsExp: app.yearsExperience ?? null,
          source: "careers_portal",
        },
        select: { id: true },
      });

      // The three typed records. None of them alone is a lawful basis; the
      // genuinely optional consent is stored ONLY when it was actually given.
      const base = {
        candidateId: candidate.id,
        organizationId: args.organizationId,
        consentVersion: args.consentVersion,
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

      return application.id;
    });
    return { ok: true, applicationId };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return { ok: false, code: "DUPLICATE" };
    return { ok: false, code: "WRITE_FAILED" };
  }
}
