/**
 * ATS-S1 — job scorecard criteria: apply a role profile to a job.
 *
 * Writes the profile's criteria as AtsJobCriterion rows keyed
 * `<roleCode>.<criterionCode>`, upserting by the tenant-scoped unique
 * (organizationId, jobId, code). Existing rows with other codes are left in
 * place and counted, never silently deleted. The job must belong to the
 * actor's organization; the write and its audit row share one transaction.
 */

import { getPrisma } from "@/lib/db/prisma";
import { buildRecruitmentAuditCreate } from "./recruitment-audit";
import { findRoleProfile, qualifiedCriterionCode, type RoleProfile } from "./review/catalog";

export interface CriterionRow {
  id: string;
  code: string;
  label: string;
  kind: string;
  dimension: string;
  weight: number;
  keywords: unknown;
  minYears: number | null;
  hardGate: boolean;
  sortOrder: number;
}

export type ApplyProfileResult =
  | { ok: true; roleCode: string; written: number; untouched: number }
  | { ok: false; code: "INVALID_INPUT" | "STORE_UNAVAILABLE" | "NOT_FOUND" | "WRITE_FAILED" };

type Tx = {
  atsJob: { findFirst: (a: unknown) => Promise<{ id: string } | null> };
  atsJobCriterion: {
    upsert: (a: unknown) => Promise<unknown>;
    count: (a: unknown) => Promise<number>;
  };
  auditLog: { create: (a: unknown) => Promise<unknown> };
};
type Client = Tx & {
  atsJobCriterion: Tx["atsJobCriterion"] & { findMany: (a: unknown) => Promise<CriterionRow[]> };
  $transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
};

export async function applyRoleProfileToJob(args: {
  organizationId: string;
  jobId: string;
  roleCode: string;
  actor: { userId: string; role: string };
  correlationId: string;
}): Promise<ApplyProfileResult> {
  const profile: RoleProfile | null = findRoleProfile(args.roleCode);
  if (!profile) return { ok: false, code: "INVALID_INPUT" };
  const prisma = (await getPrisma()) as unknown as Client | null;
  if (!prisma) return { ok: false, code: "STORE_UNAVAILABLE" };

  try {
    return await prisma.$transaction(async (tx) => {
      const job = await tx.atsJob.findFirst({
        where: { id: args.jobId, organizationId: args.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!job) return { ok: false as const, code: "NOT_FOUND" as const };

      let written = 0;
      for (const [i, c] of profile.criteria.entries()) {
        const code = qualifiedCriterionCode(profile.code, c.code);
        const data = {
          label: c.label,
          kind: c.kind,
          dimension: c.dimension,
          weight: c.weight,
          keywords: [...c.keywords],
          minYears: c.minYears ?? null,
          hardGate: c.hardGate,
          sortOrder: i,
        };
        await tx.atsJobCriterion.upsert({
          where: { organizationId_jobId_code: { organizationId: args.organizationId, jobId: job.id, code } },
          create: { organizationId: args.organizationId, jobId: job.id, code, ...data },
          update: data,
        });
        written++;
      }
      const total = await tx.atsJobCriterion.count({ where: { organizationId: args.organizationId, jobId: job.id } });

      await tx.auditLog.create(
        buildRecruitmentAuditCreate({
          action: "recruitment.job.criteria_applied",
          entityType: "AtsJob",
          entityId: job.id,
          userId: args.actor.userId,
          organizationId: args.organizationId,
          correlationId: args.correlationId,
          metadata: {
            reason: `role profile ${profile.code} applied to job scorecard`,
            before: null,
            after: { roleCode: profile.code, written, total, rubricVersion: "catalog" },
            stage: "S1",
          },
        }),
      );
      return { ok: true as const, roleCode: profile.code, written, untouched: Math.max(0, total - written) };
    });
  } catch {
    return { ok: false, code: "WRITE_FAILED" };
  }
}

export async function listJobCriteria(organizationId: string, jobId: string): Promise<CriterionRow[] | null> {
  const prisma = (await getPrisma()) as unknown as Client | null;
  if (!prisma) return null;
  try {
    return await prisma.atsJobCriterion.findMany({
      where: { organizationId, jobId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, label: true, kind: true, dimension: true, weight: true, keywords: true, minYears: true, hardGate: true, sortOrder: true },
    });
  } catch {
    return null;
  }
}
