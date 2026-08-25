/**
 * PHASE 104-B1 — the recruitment domain service.
 *
 * `createJobDraft()` replaces the never-wired `createJob()` (finding F11: zero
 * callers, silent onsite/USD defaults). Contract:
 *
 *   * explicit Zod input — unknown keys are REJECTED, so an owner-gated field
 *     (employmentType, contractType, numberOfOpenings, workingHoursSchedule,
 *     educationRequirement, minimumExperience, closingDate, isPublic, status,
 *     publishedAt …) cannot ride in on a request body;
 *   * the actor must be authenticated and org-resolved by the caller; the
 *     service re-checks that the actor is an ACTIVE member of the organization
 *     it writes into — tenant isolation at the write site;
 *   * the draft is ALWAYS status=DRAFT, isPublic=false, publishedAt=null;
 *   * requisitionKey is REQUIRED for every job this writer creates;
 *   * the EN, DE and FA translations land in the SAME transaction as the job
 *     row and the typed audit entry — a partial write is a rolled-back write;
 *   * EN content is mirrored into the legacy AtsJob columns for compatibility,
 *     but locale rendering reads the translation row of that locale;
 *   * no invented values: no salary, no currency, no location type.
 */

import { z } from "zod";
import { getPrisma } from "@/lib/db/prisma";
import { buildRecruitmentAuditCreate } from "./recruitment-audit";

const stringList = z.array(z.string().trim().min(1)).max(64);

const translationInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    shortSummary: z.string().trim().min(1).max(500),
    description: z.string().trim().min(1).max(20000),
    departmentLabel: z.string().trim().min(1).max(120),
    responsibilities: stringList,
    requirements: stringList,
    preferredExperience: stringList.optional().default([]),
    localizedSkills: z.record(z.string().trim().min(1), z.string().trim().min(1)).default({}),
    seoTitle: z.string().trim().min(1).max(200),
    seoDescription: z.string().trim().min(1).max(400),
  })
  .strict();

export const createJobDraftInputSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    requisitionKey: z.string().trim().min(1).max(120),
    department: z.string().trim().min(1).max(120),
    location: z.string().trim().min(1).max(200),
    addressLocality: z.string().trim().min(1).max(120).optional(),
    addressRegion: z.string().trim().min(1).max(120).optional(),
    addressCountry: z.string().trim().length(2).optional(),
    skillCodes: stringList.optional().default([]),
    translations: z
      .object({ en: translationInput, de: translationInput, fa: translationInput })
      .strict(),
  })
  .strict();

export type CreateJobDraftInput = z.infer<typeof createJobDraftInputSchema>;

export interface RecruitmentActor {
  userId: string;
}

export type CreateJobDraftResult =
  | { ok: true; jobId: string }
  | { ok: false; code: "STORE_UNAVAILABLE" | "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "WRITE_FAILED" };

type Tx = {
  organizationMember: { findFirst: (a: unknown) => Promise<{ id: string } | null> };
  atsJob: { create: (a: unknown) => Promise<{ id: string }> };
  atsJobTranslation: { create: (a: unknown) => Promise<unknown> };
  auditLog: { create: (a: unknown) => Promise<unknown> };
};
type TxClient = { $transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> };

/**
 * Create a private DRAFT vacancy with its three translations, atomically.
 * Never publishes, never invents a value, never half-writes.
 */
export async function createJobDraft(
  rawInput: unknown,
  actor: RecruitmentActor,
): Promise<CreateJobDraftResult> {
  const parsed = createJobDraftInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const input = parsed.data;

  if (!actor?.userId) return { ok: false, code: "FORBIDDEN" };

  const prisma = (await getPrisma()) as unknown as (TxClient & Tx) | null;
  if (!prisma) return { ok: false, code: "STORE_UNAVAILABLE" };

  try {
    const jobId = await prisma.$transaction(async (tx) => {
      // Tenant isolation at the write site: the actor must be an ACTIVE member
      // of the organization this draft is created in. A client-supplied
      // organizationId alone proves nothing.
      const membership = await tx.organizationMember.findFirst({
        where: { organizationId: input.organizationId, userId: actor.userId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!membership) throw new RecruitmentRefusal("FORBIDDEN");

      const en = input.translations.en;
      const job = await tx.atsJob.create({
        data: {
          organizationId: input.organizationId,
          requisitionKey: input.requisitionKey,
          department: input.department,
          location: input.location,
          addressLocality: input.addressLocality ?? null,
          addressRegion: input.addressRegion ?? null,
          addressCountry: input.addressCountry ?? null,
          skills: input.skillCodes,
          // EN mirror for the legacy columns — rendering reads translations.
          title: en.title,
          description: en.description,
          requirements: en.requirements,
          responsibilities: en.responsibilities,
          benefits: [],
          // The ONLY allowed initial state. Publication is a separate,
          // owner-authorized action in a later stage.
          status: "DRAFT",
          isPublic: false,
          publishedAt: null,
          postedById: actor.userId,
          // Owner-gated columns stay NULL — no invented defaults.
          locationType: null,
          salaryCurrency: null,
          salaryMin: null,
          salaryMax: null,
        },
        select: { id: true },
      });

      for (const [lang, t] of [["EN", input.translations.en], ["DE", input.translations.de], ["FA", input.translations.fa]] as const) {
        await tx.atsJobTranslation.create({
          data: {
            jobId: job.id,
            language: lang,
            title: t.title,
            shortSummary: t.shortSummary,
            description: t.description,
            departmentLabel: t.departmentLabel,
            responsibilities: t.responsibilities,
            requirements: t.requirements,
            preferredExperience: t.preferredExperience,
            localizedSkills: t.localizedSkills,
            seoTitle: t.seoTitle,
            seoDescription: t.seoDescription,
          },
        });
      }

      await tx.auditLog.create(
        buildRecruitmentAuditCreate({
          action: "recruitment.job.draft_created",
          entityType: "AtsJob",
          entityId: job.id,
          userId: actor.userId,
          organizationId: input.organizationId,
          metadata: {
            reason: "Stage B1 recruiter draft via POST /api/ats/jobs",
            before: null,
            after: {
              requisitionKey: input.requisitionKey,
              department: input.department,
              status: "DRAFT",
              isPublic: false,
              languages: ["EN", "DE", "FA"],
            },
            stage: "B1",
          },
        }),
      );

      return job.id;
    });
    return { ok: true, jobId };
  } catch (err) {
    if (err instanceof RecruitmentRefusal) return { ok: false, code: err.code };
    if (isUniqueViolation(err)) return { ok: false, code: "CONFLICT" };
    return { ok: false, code: "WRITE_FAILED" };
  }
}

class RecruitmentRefusal extends Error {
  constructor(public readonly code: "FORBIDDEN") {
    super(code);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
