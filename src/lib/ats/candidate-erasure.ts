/**
 * ATS go-live — audited candidate erasure (Option B).
 *
 * This is NOT a parallel erasure system. It uses the canonical pieces:
 *   - `AtsCandidate.deletedAt` as the single erasure marker (the same flag
 *     intake already refuses a new application against, and the dashboard and
 *     the review worker already exclude);
 *   - the shared `anonymiseApplicationTx` primitive (the exact logic the
 *     retention sweep uses) to clear each affected application's personal
 *     content;
 *   - the recruitment audit builder and the compliance legal-hold engine.
 *
 * It erases a candidate for ONE organization, in ONE atomic transaction:
 * it anonymises that organization's applications and clears the candidate's
 * identifying fields. A data-erasure request is not a hiring decision, so no
 * application status is changed. The immutable AuditLog, the pipeline history,
 * the consent evidence and the recorded human decisions are kept — without any
 * identifying content.
 *
 * SAFETY:
 *   - tenant-scoped: the candidate is reached only THROUGH an application in
 *     the acting organization; an unknown or cross-tenant candidate is an
 *     indistinguishable NOT_FOUND;
 *   - a candidate that another organization still references is refused
 *     (CROSS_ORG): a second controller's lawful basis is not ours to erase,
 *     and the shared record must not be cleared on its behalf;
 *   - an active legal hold fails the whole operation closed (nothing changes);
 *   - active membership is re-checked inside the transaction;
 *   - idempotent: a second erasure of the same candidate is a no-op success;
 *   - any mid-transaction fault rolls the whole operation back.
 *
 * The e-mail is replaced with a non-personal, non-recoverable placeholder bound
 * only to the candidate id. That removes the real address (so no hidden
 * PII-comparison can block a future application) while keeping the column's
 * uniqueness intact.
 */
import { getPrisma } from "@/lib/db/prisma";
import { isUnderLegalHold, type HoldLike } from "@/lib/compliance/retention-engine";
import { anonymiseApplicationTx, type AnonymiseTx } from "./anonymise";
import { buildRecruitmentAuditCreate } from "./recruitment-audit";

export type EraseCandidateCode =
  | "ERASED"
  | "ALREADY_ERASED"
  | "NOT_FOUND"
  | "LEGAL_HOLD"
  | "CROSS_ORG"
  | "MEMBERSHIP_LOST"
  | "STORE_UNAVAILABLE";

export interface EraseCandidateResult {
  ok: boolean;
  code: EraseCandidateCode;
  applicationsAnonymised: number;
}

export interface EraseCandidateArgs {
  organizationId: string;
  candidateId: string;
  actorUserId: string;
  reason: string;
  correlationId: string;
  now?: Date;
}

interface AppRef { id: string; createdAt: Date }

interface ErasureTx extends AnonymiseTx {
  organizationMember: { findFirst: (a: unknown) => Promise<{ id: string } | null> };
  atsCandidate: {
    findUnique: (a: unknown) => Promise<{ id: string; deletedAt: Date | null } | null>;
    update: (a: unknown) => Promise<unknown>;
  };
  auditLog: { create: (a: unknown) => Promise<unknown> };
}

interface ErasureClient {
  atsApplication: {
    findMany: (a: unknown) => Promise<AppRef[]>;
    count: (a: unknown) => Promise<number>;
  };
  legalHold: { findMany: (a: unknown) => Promise<HoldLike[]> };
  $transaction: <T>(fn: (tx: ErasureTx) => Promise<T>) => Promise<T>;
}

export async function eraseCandidate(args: EraseCandidateArgs): Promise<EraseCandidateResult> {
  const now = args.now ?? new Date();
  const prisma = (await getPrisma()) as unknown as ErasureClient | null;
  if (!prisma) return { ok: false, code: "STORE_UNAVAILABLE", applicationsAnonymised: 0 };

  // ── Read-only pre-checks (tenant scope, legal hold, cross-org). ──
  let appsInOrg: AppRef[];
  let holds: HoldLike[];
  let crossOrgCount: number;
  try {
    appsInOrg = await prisma.atsApplication.findMany({
      where: { organizationId: args.organizationId, candidateId: args.candidateId },
      select: { id: true, createdAt: true },
    });
    // Reached only through an application in this org. Unknown or cross-tenant
    // candidates are the same indistinguishable answer.
    if (appsInOrg.length === 0) return { ok: false, code: "NOT_FOUND", applicationsAnonymised: 0 };

    holds = await prisma.legalHold.findMany({ where: { organizationId: args.organizationId, status: "ACTIVE" } });
    crossOrgCount = await prisma.atsApplication.count({
      where: { candidateId: args.candidateId, organizationId: { not: args.organizationId }, deletedAt: null },
    });
  } catch {
    return { ok: false, code: "STORE_UNAVAILABLE", applicationsAnonymised: 0 };
  }

  for (const app of appsInOrg) {
    const held = isUnderLegalHold(
      { organizationId: args.organizationId, subjectId: args.candidateId, resourceType: "AtsApplication", resourceId: app.id, timestamp: app.createdAt },
      holds,
    );
    if (held) return { ok: false, code: "LEGAL_HOLD", applicationsAnonymised: 0 };
  }

  if (crossOrgCount > 0) return { ok: false, code: "CROSS_ORG", applicationsAnonymised: 0 };

  // ── Atomic erasure. ──
  try {
    return await prisma.$transaction(async (tx) => {
      const member = await tx.organizationMember.findFirst({
        where: { userId: args.actorUserId, organizationId: args.organizationId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!member) return { ok: false, code: "MEMBERSHIP_LOST", applicationsAnonymised: 0 } as const;

      const candidate = await tx.atsCandidate.findUnique({
        where: { id: args.candidateId },
        select: { id: true, deletedAt: true },
      });
      if (!candidate) return { ok: false, code: "NOT_FOUND", applicationsAnonymised: 0 } as const;
      if (candidate.deletedAt) return { ok: true, code: "ALREADY_ERASED", applicationsAnonymised: 0 } as const;

      let anonymised = 0;
      for (const app of appsInOrg) {
        if (await anonymiseApplicationTx(tx, { applicationId: app.id, organizationId: args.organizationId, now })) {
          anonymised++;
        }
      }

      await tx.atsCandidate.update({
        where: { id: args.candidateId, deletedAt: null },
        data: {
          deletedAt: now,
          name: "",
          email: `erased-${args.candidateId}@erased.invalid`,
          phone: null,
          location: null,
          linkedinUrl: null,
          portfolioUrl: null,
          summary: null,
          skills: [],
        },
      });

      await tx.auditLog.create(
        buildRecruitmentAuditCreate({
          action: "recruitment.candidate.erased",
          entityType: "AtsCandidate",
          entityId: args.candidateId,
          userId: args.actorUserId,
          organizationId: args.organizationId,
          correlationId: args.correlationId,
          metadata: {
            reason: args.reason,
            before: { erased: false },
            after: { erased: true },
            stage: "M1",
            affectedCounts: { applicationsAnonymised: anonymised },
          },
        }),
      );

      return { ok: true, code: "ERASED", applicationsAnonymised: anonymised } as const;
    });
  } catch {
    return { ok: false, code: "STORE_UNAVAILABLE", applicationsAnonymised: 0 };
  }
}
