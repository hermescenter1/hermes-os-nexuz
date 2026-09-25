/**
 * ATS-M1 — the position-management domain service.
 *
 * Every write here:
 *   * is scoped to the organization of the AUTHENTICATED actor (the route
 *     passes `organizationId` from `requireAtsActor`, never from the body) and
 *     every predicate carries it — tenant isolation at the query, not by
 *     convention;
 *   * re-proves the actor's ACTIVE membership inside the transaction;
 *   * is conditional on the `version` the editor loaded (optimistic
 *     concurrency — a stale form is refused, never merged);
 *   * writes its audit row in the SAME transaction (an audit entry that can
 *     vanish while the position change commits is not an audit trail);
 *   * is idempotent under the request's `Idempotency-Key` (./idempotency.ts).
 *
 * What is never done here, by construction:
 *   * no hard delete — `atsJob.delete` is not called anywhere; "delete" sets
 *     `deletedAt`, and the database also refuses to remove a job that still
 *     has applications (AtsApplication_jobId_fkey is NO ACTION);
 *   * no application, candidate, review or interview row is written — closing
 *     or archiving a position leaves every application exactly where a human
 *     put it (no auto-reject, no auto-advance);
 *   * no position becomes OPEN without the publish gate (./readiness.ts).
 */

import { getPrisma } from "@/lib/db/prisma";
import { atsCan, type AtsCapability } from "@/lib/ats/rbac";
import { buildRecruitmentAuditCreate, type RecruitmentAuditAction } from "@/lib/ats/recruitment-audit";
import { ROLE_PROFILES, qualifiedCriterionCode, type RoleCode } from "@/lib/ats/review/catalog";
import {
  createPositionSchema,
  updatePositionSchema,
  transitionSchema,
  softDeleteSchema,
  initialDraftsSchema,
  type CreatePositionInput,
  type CriteriaInput,
  type CriterionInput,
  type LocaleCopy,
  type PositionLocale,
  type UpdatePositionInput,
} from "./contract";
import { canonicalStatus, checkTransition, canSoftDelete, isEditable, allowedActions, TRANSITION_AUDIT_ACTION, SOFT_DELETE_RULE } from "./state-machine";
import { evaluatePublishReadiness, judgedStrings, scanProtectedTerms, type ReadinessVerdict } from "./readiness";
import type { IdempotencyTx } from "./idempotency";
import { ManagementRefusal, runMutation, zodIssues, type MutationContext, type MutationResult } from "./mutation";
import { readSettingsOrDefaults, type SettingsReader } from "@/lib/ats/settings/defaults";

// ── Prisma surface (structural, the repository's pattern for testability) ────

type Fn<R = unknown> = (a: unknown) => Promise<R>;

export interface JobRow {
  id: string;
  organizationId: string;
  requisitionKey: string | null;
  status: string;
  isPublic: boolean;
  publishedAt: Date | null;
  closingDate: Date | null;
  deletedAt: Date | null;
  title: string;
  internalTitle: string | null;
  department: string;
  location: string;
  employmentType: string | null;
  locationType: string | null;
  addressLocality: string | null;
  addressCountry: string | null;
  sponsorshipPolicy: string | null;
  relocationPolicy: string | null;
  salaryConfidential: boolean;
  salaryCurrency: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  internalBrief: string | null;
  evidenceRequirements: unknown;
  scoringRubric: unknown;
  interviewKit: unknown;
  assessmentConfig: unknown;
  roleProfileCode: string | null;
  approvalOwnerRole: string | null;
  decisionSlaDays: number | null;
  hiringManagerId: string | null;
  pausedAt: Date | null;
  closedAt: Date | null;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  translations?: TranslationRow[];
  criteria?: CriterionRow[];
}

export interface TranslationRow {
  language: string;
  title: string;
  shortSummary: string;
  description: string;
  departmentLabel: string;
  responsibilities: unknown;
  requirements: unknown;
  preferredExperience: unknown;
  seoTitle: string;
  seoDescription: string;
}

export interface CriterionRow {
  code: string;
  kind: string;
  label: string;
  dimension: string;
  weight: number;
  keywords: unknown;
  minYears: number | null;
  hardGate: boolean;
  sortOrder: number;
}

export interface PositionTx extends IdempotencyTx, SettingsReader {
  organizationMember: { findFirst: Fn<{ id: string } | null> };
  atsJob: { findFirst: Fn<JobRow | null>; create: Fn<{ id: string }>; updateMany: Fn<{ count: number }> };
  atsJobTranslation: { upsert: Fn };
  atsJobCriterion: { deleteMany: Fn; upsert: Fn; findMany: Fn<CriterionRow[]> };
  atsApplication: { count: Fn<number> };
  atsInterview: { count: Fn<number> };
  atsAiReview: { count: Fn<number> };
  auditLog: { create: Fn; count: Fn<number> };
}

export interface PositionClient extends PositionTx {
  atsJob: PositionTx["atsJob"] & { findMany: Fn<ListRow[]> };
  auditLog: PositionTx["auditLog"] & { findMany: Fn<AuditRow[]> };
  organizationMember: PositionTx["organizationMember"] & { findMany: Fn<MemberRow[]> };
  $transaction: <T>(fn: (tx: PositionTx) => Promise<T>) => Promise<T>;
}

export interface ListRow {
  id: string;
  requisitionKey: string | null;
  status: string;
  isPublic: boolean;
  publishedAt: Date | null;
  closingDate: Date | null;
  title: string;
  internalTitle: string | null;
  department: string;
  location: string;
  employmentType: string | null;
  locationType: string | null;
  version: number;
  updatedAt: Date;
  translations: { language: string; title: string }[];
  _count: { applications: number };
}

export interface AuditRow {
  id: string;
  action: string;
  userId: string | null;
  createdAt: Date;
  correlationId: string | null;
  outcome: string | null;
  metadata: unknown;
}

export interface MemberRow {
  id: string;
  role: string;
  userId?: string;
  user: { name: string | null } | null;
}

async function client(): Promise<PositionClient | null> {
  return (await getPrisma()) as unknown as PositionClient | null;
}

// ── Results ──────────────────────────────────────────────────────────────────

export type { MutationResult, MutationContext, RefusalDetail } from "./mutation";

async function runPositionMutation<T>(
  ctx: MutationContext,
  operation: string,
  target: string | null,
  body: unknown,
  work: (tx: PositionTx, now: Date) => Promise<T>,
): Promise<MutationResult<T>> {
  return runMutation<T, PositionTx>(await client(), ctx, operation, target, body, work);
}

function requireCapability(role: string, capability: AtsCapability): void {
  if (!atsCan(role, capability)) throw new ManagementRefusal("FORBIDDEN");
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

const LANG: Record<PositionLocale, "EN" | "FA" | "DE"> = { en: "EN", fa: "FA", de: "DE" };

function translationData(copy: LocaleCopy, department: string) {
  return {
    title: copy.title,
    shortSummary: copy.summary,
    description: copy.description,
    departmentLabel: department,
    responsibilities: copy.responsibilities,
    requirements: copy.requirements,
    preferredExperience: copy.preferredExperience,
    localizedSkills: {},
    seoTitle: copy.title,
    seoDescription: copy.summary,
  };
}

/**
 * The UPDATE of an existing translation row. The editor manages title,
 * summary, description and the three lists; it does NOT manage the localized
 * skill labels or a hand-written per-locale department label / SEO text (a
 * B1-created position has real ones). So an edit never touches
 * `localizedSkills`, and rewrites `departmentLabel`, `seoTitle` and
 * `seoDescription` only while they are still the DERIVED value (empty, or
 * equal to what M1 itself would have derived from the previous content) —
 * a translated label is never replaced by the raw department string.
 */
function translationUpdateData(copy: LocaleCopy, department: string, existing: TranslationRow | undefined, previousDepartment: string) {
  const derived = (current: string | undefined, previous: string | undefined, next: string) =>
    current === undefined || current.trim() === "" || current === previous ? next : current;
  return {
    title: copy.title,
    shortSummary: copy.summary,
    description: copy.description,
    responsibilities: copy.responsibilities,
    requirements: copy.requirements,
    preferredExperience: copy.preferredExperience,
    departmentLabel: derived(existing?.departmentLabel, previousDepartment, department),
    seoTitle: derived(existing?.seoTitle, existing?.title, copy.title),
    seoDescription: derived(existing?.seoDescription, existing?.shortSummary, copy.summary),
  };
}

const KIND_PREFIX = { mustHave: "mh", niceToHave: "nh", disqualifiers: "dq" } as const;
const KIND_OF = { mustHave: "MUST_HAVE", niceToHave: "NICE_TO_HAVE", disqualifiers: "DISQUALIFIER" } as const;

function criterionRows(criteria: CriteriaInput) {
  const rows: Omit<CriterionRow, "sortOrder">[] = [];
  for (const group of ["mustHave", "niceToHave", "disqualifiers"] as const) {
    criteria[group].forEach((c: CriterionInput, i: number) => {
      rows.push({
        code: c.code ?? `${KIND_PREFIX[group]}-${i + 1}`,
        kind: KIND_OF[group],
        label: c.label,
        dimension: c.dimension,
        weight: c.weight,
        keywords: [...c.keywords],
        minYears: c.minYears ?? null,
        hardGate: group === "disqualifiers" ? true : c.hardGate,
      });
    });
  }
  const codes = rows.map((r) => r.code);
  if (new Set(codes).size !== codes.length) {
    throw new ManagementRefusal("INVALID_INPUT", { issues: [{ path: "criteria", message: "criterion codes must be unique" }] });
  }
  return rows.map((r, sortOrder) => ({ ...r, sortOrder }));
}

async function replaceCriteria(tx: PositionTx, organizationId: string, jobId: string, criteria: CriteriaInput) {
  const rows = criterionRows(criteria);
  await tx.atsJobCriterion.deleteMany({
    where: { organizationId, jobId, code: { notIn: rows.map((r) => r.code) } },
  });
  for (const r of rows) {
    const { code, ...data } = r;
    await tx.atsJobCriterion.upsert({
      where: { organizationId_jobId_code: { organizationId, jobId, code } },
      create: { organizationId, jobId, code, ...data },
      update: data,
    });
  }
  return rows.length;
}

async function assertHiringOwner(tx: PositionTx, organizationId: string, memberId: string | null | undefined) {
  if (!memberId) return;
  const m = await tx.organizationMember.findFirst({
    where: { id: memberId, organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!m) throw new ManagementRefusal("HIRING_OWNER_INVALID");
}

function protectedTermsIn(input: Partial<CreatePositionInput>): string[] {
  const criteria = input.criteria
    ? [...input.criteria.mustHave, ...input.criteria.niceToHave, ...input.criteria.disqualifiers].map((c) => ({
        kind: "",
        label: c.label,
        keywords: c.keywords,
      }))
    : [];
  return scanProtectedTerms(
    judgedStrings({
      criteria,
      interviewKit: input.interviewKit ?? null,
      assessmentConfig: input.assessment ?? null,
      evidenceRequirements: input.evidenceRequirements ?? [],
    }),
  );
}

export interface LinkedCounts {
  applications: number;
  interviews: number;
  aiReviews: number;
  auditRecords: number;
}

async function linkedCounts(tx: PositionTx, organizationId: string, jobId: string): Promise<LinkedCounts> {
  const [applications, interviews, aiReviews, auditRecords] = await Promise.all([
    tx.atsApplication.count({ where: { organizationId, jobId } }),
    tx.atsInterview.count({ where: { organizationId, application: { jobId } } }),
    tx.atsAiReview.count({ where: { organizationId, application: { jobId } } }),
    tx.auditLog.count({ where: { organizationId, entityType: "AtsJob", entityId: jobId } }),
  ]);
  return { applications, interviews, aiReviews, auditRecords };
}

const JOB_WITH_CONTENT = {
  translations: {
    select: {
      language: true,
      title: true,
      shortSummary: true,
      description: true,
      departmentLabel: true,
      responsibilities: true,
      requirements: true,
      preferredExperience: true,
      seoTitle: true,
      seoDescription: true,
    },
  },
  criteria: {
    orderBy: { sortOrder: "asc" },
    select: { code: true, kind: true, label: true, dimension: true, weight: true, keywords: true, minYears: true, hardGate: true, sortOrder: true },
  },
} as const;

async function loadJob(tx: PositionTx, organizationId: string, jobId: string): Promise<JobRow> {
  const job = await tx.atsJob.findFirst({
    where: { id: jobId, organizationId, deletedAt: null },
    include: JOB_WITH_CONTENT,
  });
  if (!job) throw new ManagementRefusal("NOT_FOUND");
  return job;
}

function readinessOf(job: JobRow, defaultLocale: PositionLocale, now: Date, closingOverride?: Date | null): ReadinessVerdict {
  const verdict = evaluatePublishReadiness(
    {
      title: job.title,
      hiringManagerId: job.hiringManagerId,
      approvalOwnerRole: job.approvalOwnerRole,
      decisionSlaDays: job.decisionSlaDays,
      scoringRubric: job.scoringRubric,
      interviewKit: job.interviewKit,
      assessmentConfig: job.assessmentConfig,
      evidenceRequirements: job.evidenceRequirements,
      closingDate: closingOverride === undefined ? job.closingDate : closingOverride,
      translations: job.translations ?? [],
      criteria: job.criteria ?? [],
      defaultLocale,
    },
    now,
  );
  if (job.location.trim().length === 0) {
    verdict.missing.push("LOCATION_MISSING");
    verdict.ready = false;
  }
  return verdict;
}

function audit(
  tx: PositionTx,
  ctx: MutationContext,
  action: RecruitmentAuditAction,
  jobId: string,
  reason: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  affectedCounts?: LinkedCounts,
) {
  return tx.auditLog.create(
    buildRecruitmentAuditCreate({
      action,
      entityType: "AtsJob",
      entityId: jobId,
      userId: ctx.actor.userId,
      organizationId: ctx.organizationId,
      correlationId: ctx.correlationId,
      metadata: {
        reason,
        before,
        after,
        stage: "M1",
        ...(affectedCounts ? { affectedCounts: { ...affectedCounts } } : {}),
      },
    }),
  );
}

/**
 * Prisma's sentinel for SQL NULL in a Json column. Loaded lazily, like the
 * client itself in src/lib/db/prisma.ts: the repository never imports the
 * Prisma runtime statically.
 */
async function dbNull(): Promise<unknown> {
  const mod = (await import("@prisma/client")) as unknown as { Prisma?: { DbNull?: unknown } };
  if (!mod.Prisma?.DbNull) throw new ManagementRefusal("STORE_UNAVAILABLE");
  return mod.Prisma.DbNull;
}

function generatedRequisitionKey(now: Date): string {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `POS-${ymd}-${rand}`;
}

function isoOrNull(v: string | null | undefined): Date | null {
  return v ? new Date(v) : null;
}

// ── Create ───────────────────────────────────────────────────────────────────

export interface CreatedPosition {
  jobId: string;
  requisitionKey: string;
  status: "DRAFT";
  isPublic: false;
  version: number;
}

export async function createPosition(raw: unknown, ctx: MutationContext): Promise<MutationResult<CreatedPosition>> {
  const parsed = createPositionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", detail: { issues: zodIssues(parsed.error) } };
  const input = parsed.data;
  const terms = protectedTermsIn(input);
  if (terms.length > 0) return { ok: false, code: "PROTECTED_TERM", detail: { protectedTerms: terms } };

  return runPositionMutation(ctx, "position.create", null, input, async (tx, now) => {
    requireCapability(ctx.actor.role, "ATS_MANAGE");
    await assertHiringOwner(tx, ctx.organizationId, input.hiringOwnerMemberId);
    const settings = await readSettingsOrDefaults(tx, ctx.organizationId);
    const requisitionKey = input.requisitionKey ?? generatedRequisitionKey(now);

    const job = await tx.atsJob.create({
      data: {
        organizationId: ctx.organizationId,
        requisitionKey,
        title: input.publicTitle,
        internalTitle: input.internalTitle,
        department: input.department,
        location: input.location,
        addressLocality: input.addressLocality ?? null,
        addressCountry: input.addressCountry ?? null,
        employmentType: input.employmentType ?? null,
        locationType: input.workMode ?? null,
        sponsorshipPolicy: input.sponsorshipPolicy ?? null,
        relocationPolicy: input.relocationPolicy ?? null,
        salaryConfidential: input.salary?.confidential ?? false,
        salaryCurrency: input.salary?.currency ?? null,
        salaryMin: input.salary?.min ?? null,
        salaryMax: input.salary?.max ?? null,
        internalBrief: input.internalBrief ?? null,
        evidenceRequirements: input.evidenceRequirements ?? [],
        scoringRubric: input.scoringRubric ?? undefined, // create: absent and null both mean "none yet"
        interviewKit: input.interviewKit ?? (settings.defaultInterviewStages.length > 0 ? settings.defaultInterviewStages : undefined),
        assessmentConfig: input.assessment ?? undefined,
        roleProfileCode: input.roleProfileCode ?? null,
        approvalOwnerRole: input.approvalOwnerRole ?? settings.defaultApprovalOwnerRole,
        decisionSlaDays: input.decisionSlaDays ?? settings.defaultDecisionSlaDays,
        hiringManagerId: input.hiringOwnerMemberId ?? null,
        closingDate: isoOrNull(input.closingDate),
        // EN mirror of the legacy columns; the public pages read translations.
        description: input.copy.en.description,
        requirements: input.copy.en.requirements,
        responsibilities: input.copy.en.responsibilities,
        benefits: [],
        skills: [],
        // The ONLY initial state. Opening is a separate, gated transition.
        status: "DRAFT",
        isPublic: false,
        publishedAt: null,
        postedById: ctx.actor.userId,
        version: 0,
      },
      select: { id: true },
    });

    const languages: string[] = [];
    for (const locale of ["en", "fa", "de"] as const) {
      const copy = input.copy[locale];
      if (!copy || copy.title.length === 0) continue;
      await tx.atsJobTranslation.upsert({
        where: { jobId_language: { jobId: job.id, language: LANG[locale] } },
        create: { jobId: job.id, language: LANG[locale], ...translationData(copy, input.department) },
        update: translationData(copy, input.department),
      });
      languages.push(LANG[locale]);
    }
    const criteriaCount = input.criteria ? await replaceCriteria(tx, ctx.organizationId, job.id, input.criteria) : 0;

    await audit(tx, ctx, "recruitment.position.created", job.id, "position created as a private DRAFT", null, {
      requisitionKey,
      status: "DRAFT",
      isPublic: false,
      languages,
      criteriaCount,
      version: 0,
    });
    return { jobId: job.id, requisitionKey, status: "DRAFT" as const, isPublic: false as const, version: 0 };
  });
}

// ── Update ───────────────────────────────────────────────────────────────────

export interface UpdatedPosition {
  jobId: string;
  version: number;
  fieldsChanged: string[];
}

/** Short, non-sensitive fields whose before/after values the audit records verbatim. */
const AUDITED_VALUES = [
  "internalTitle",
  "title",
  "department",
  "location",
  "employmentType",
  "locationType",
  "sponsorshipPolicy",
  "relocationPolicy",
  "salaryConfidential",
  "approvalOwnerRole",
  "decisionSlaDays",
  "hiringManagerId",
  "closingDate",
  "roleProfileCode",
] as const;

export async function updatePosition(jobId: string, raw: unknown, ctx: MutationContext): Promise<MutationResult<UpdatedPosition>> {
  const parsed = updatePositionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", detail: { issues: zodIssues(parsed.error) } };
  const input: UpdatePositionInput = parsed.data;
  const terms = protectedTermsIn(input);
  if (terms.length > 0) return { ok: false, code: "PROTECTED_TERM", detail: { protectedTerms: terms } };

  return runPositionMutation(ctx, "position.update", jobId, input, async (tx, now) => {
    requireCapability(ctx.actor.role, "ATS_MANAGE");
    const job = await loadJob(tx, ctx.organizationId, jobId);
    if (!isEditable(job.status)) throw new ManagementRefusal("INVALID_TRANSITION");
    if (job.version !== input.expectedVersion) throw new ManagementRefusal("STALE");
    if (input.hiringOwnerMemberId !== undefined) await assertHiringOwner(tx, ctx.organizationId, input.hiringOwnerMemberId);

    const data: Record<string, unknown> = {};
    const set = (k: string, v: unknown) => {
      if (v !== undefined) data[k] = v;
    };
    set("internalTitle", input.internalTitle);
    set("title", input.publicTitle);
    set("department", input.department);
    set("location", input.location);
    set("addressLocality", input.addressLocality);
    set("addressCountry", input.addressCountry);
    set("employmentType", input.employmentType);
    set("locationType", input.workMode);
    set("sponsorshipPolicy", input.sponsorshipPolicy);
    set("relocationPolicy", input.relocationPolicy);
    if (input.salary) {
      data.salaryConfidential = input.salary.confidential;
      data.salaryCurrency = input.salary.currency ?? null;
      data.salaryMin = input.salary.min ?? null;
      data.salaryMax = input.salary.max ?? null;
    }
    set("internalBrief", input.internalBrief);
    set("evidenceRequirements", input.evidenceRequirements);
    // A Json column is cleared with Prisma's DbNull sentinel, never a plain null.
    set("scoringRubric", input.scoringRubric === null ? await dbNull() : input.scoringRubric);
    set("interviewKit", input.interviewKit);
    set("assessmentConfig", input.assessment === null ? await dbNull() : input.assessment);
    set("roleProfileCode", input.roleProfileCode);
    set("approvalOwnerRole", input.approvalOwnerRole);
    set("decisionSlaDays", input.decisionSlaDays);
    set("hiringManagerId", input.hiringOwnerMemberId);
    if (input.closingDate !== undefined) data.closingDate = isoOrNull(input.closingDate);
    if (input.copy) {
      data.description = input.copy.en.description;
      data.requirements = input.copy.en.requirements;
      data.responsibilities = input.copy.en.responsibilities;
    }

    const SALARY_COLUMNS = new Set(["salaryConfidential", "salaryCurrency", "salaryMin", "salaryMax"]);
    const LEGACY_MIRROR = new Set(["description", "requirements", "responsibilities"]);
    const fieldsChanged = [
      ...new Set([
        ...Object.keys(data)
          .filter((k) => !LEGACY_MIRROR.has(k))
          .map((k) => (SALARY_COLUMNS.has(k) ? "salary" : k)),
        ...(input.copy ? ["copy"] : []),
        ...(input.criteria ? ["criteria"] : []),
      ]),
    ];

    const res = await tx.atsJob.updateMany({
      where: { id: jobId, organizationId: ctx.organizationId, version: input.expectedVersion, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    if (res.count !== 1) throw new ManagementRefusal("STALE");

    if (input.copy) {
      const department = input.department ?? job.department;
      for (const locale of ["en", "fa", "de"] as const) {
        const copy = input.copy[locale];
        if (!copy || copy.title.length === 0) continue;
        const existing = (job.translations ?? []).find((t) => t.language === LANG[locale]);
        await tx.atsJobTranslation.upsert({
          where: { jobId_language: { jobId, language: LANG[locale] } },
          create: { jobId, language: LANG[locale], ...translationData(copy, department) },
          update: translationUpdateData(copy, department, existing, job.department),
        });
      }
    }
    if (input.criteria) await replaceCriteria(tx, ctx.organizationId, jobId, input.criteria);

    // An OPEN posting may be edited, but never into a state the publish gate
    // would refuse — re-evaluate on the post-write row, inside the same
    // transaction, and roll the whole edit back if it fails.
    if (canonicalStatus(job.status) === "OPEN") {
      const settings = await readSettingsOrDefaults(tx, ctx.organizationId);
      const after = await loadJob(tx, ctx.organizationId, jobId);
      const verdict = readinessOf(after, settings.defaultPublicLocale, now);
      if (!verdict.ready) throw new ManagementRefusal("NOT_READY", { missing: verdict.missing, protectedTerms: verdict.protectedTerms });
    }

    const before: Record<string, unknown> = {};
    const afterValues: Record<string, unknown> = {};
    for (const k of AUDITED_VALUES) {
      if (k in data) {
        const b = (job as unknown as Record<string, unknown>)[k];
        const a = data[k];
        before[k] = b instanceof Date ? b.toISOString() : (b ?? null);
        afterValues[k] = a instanceof Date ? a.toISOString() : (a ?? null);
      }
    }
    const version = job.version + 1;
    await audit(
      tx,
      ctx,
      "recruitment.position.updated",
      jobId,
      "position edited",
      { ...before, version: job.version },
      { ...afterValues, fieldsChanged, version },
    );
    return { jobId, version, fieldsChanged };
  });
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export interface TransitionedPosition {
  jobId: string;
  status: string;
  isPublic: boolean;
  publishedAt: string | null;
  version: number;
}

export async function transitionPosition(jobId: string, raw: unknown, ctx: MutationContext): Promise<MutationResult<TransitionedPosition>> {
  const parsed = transitionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", detail: { issues: zodIssues(parsed.error) } };
  const input = parsed.data;

  return runPositionMutation(ctx, `position.transition.${input.action}`, jobId, input, async (tx, now) => {
    const job = await loadJob(tx, ctx.organizationId, jobId);
    const verdict = checkTransition(job.status, input.action, input.reason);
    if (!verdict.ok) throw new ManagementRefusal(verdict.code);
    requireCapability(ctx.actor.role, verdict.rule.capability);
    if (job.version !== input.expectedVersion) throw new ManagementRefusal("STALE");

    // A closing date may be (re)set only when a position OPENS.
    if (input.closingDate !== undefined && input.action !== "PUBLISH" && input.action !== "REOPEN") {
      throw new ManagementRefusal("INVALID_INPUT", { issues: [{ path: "closingDate", message: "closingDate is accepted on PUBLISH and REOPEN only" }] });
    }
    const closingOverride = input.closingDate === undefined ? undefined : isoOrNull(input.closingDate);
    const openingDate = input.openingDate ? new Date(input.openingDate) : null;
    if (openingDate && openingDate.getTime() < now.getTime() - 60_000) {
      throw new ManagementRefusal("INVALID_INPUT", { issues: [{ path: "openingDate", message: "opening date is in the past" }] });
    }
    const effectiveClosing = closingOverride === undefined ? job.closingDate : closingOverride;
    if (openingDate && effectiveClosing && effectiveClosing.getTime() <= openingDate.getTime()) {
      throw new ManagementRefusal("INVALID_INPUT", { issues: [{ path: "closingDate", message: "closing date must follow the opening date" }] });
    }

    if (verdict.rule.requiresReadiness) {
      const settings = await readSettingsOrDefaults(tx, ctx.organizationId);
      const ready = readinessOf(job, settings.defaultPublicLocale, now, closingOverride);
      if (job.hiringManagerId) {
        const owner = await tx.organizationMember.findFirst({
          where: { id: job.hiringManagerId, organizationId: ctx.organizationId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!owner && !ready.missing.includes("HIRING_OWNER_MISSING")) {
          ready.missing.push("HIRING_OWNER_MISSING");
          ready.ready = false;
        }
      }
      if (!ready.ready) throw new ManagementRefusal("NOT_READY", { missing: ready.missing, protectedTerms: ready.protectedTerms });
    }

    const data: Record<string, unknown> = { status: verdict.rule.to };
    let isPublic = job.isPublic;
    let publishedAt = job.publishedAt;
    switch (input.action) {
      case "PUBLISH":
        isPublic = (input.visibility ?? "PUBLIC") === "PUBLIC";
        publishedAt = openingDate ?? now;
        Object.assign(data, { isPublic, publishedAt, pausedAt: null, closedAt: null });
        break;
      case "PAUSE":
        data.pausedAt = now;
        break;
      case "RESUME":
        data.pausedAt = null;
        break;
      case "CLOSE":
        data.closedAt = now;
        break;
      case "REOPEN":
        if (input.visibility) isPublic = input.visibility === "PUBLIC";
        if (!publishedAt) publishedAt = now;
        Object.assign(data, { isPublic, publishedAt, closedAt: null, pausedAt: null });
        break;
      case "ARCHIVE":
        isPublic = false;
        Object.assign(data, { isPublic, archivedAt: now });
        break;
    }
    if (closingOverride !== undefined) data.closingDate = closingOverride;

    const res = await tx.atsJob.updateMany({
      where: { id: jobId, organizationId: ctx.organizationId, version: input.expectedVersion, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    if (res.count !== 1) throw new ManagementRefusal("STALE");

    const counts = ["CLOSE", "ARCHIVE", "PAUSE"].includes(input.action) ? await linkedCounts(tx, ctx.organizationId, jobId) : undefined;
    const version = job.version + 1;
    await audit(
      tx,
      ctx,
      TRANSITION_AUDIT_ACTION[input.action],
      jobId,
      input.reason ?? `position ${input.action.toLowerCase()}`,
      { status: canonicalStatus(job.status), isPublic: job.isPublic, version: job.version },
      {
        status: verdict.rule.to,
        isPublic,
        publishedAt: publishedAt ? publishedAt.toISOString() : null,
        closingDate: (closingOverride === undefined ? job.closingDate : closingOverride)?.toISOString() ?? null,
        version,
        // Closing or archiving never moves an application.
        applicationsTransitioned: 0,
      },
      counts,
    );
    return { jobId, status: verdict.rule.to, isPublic, publishedAt: publishedAt ? publishedAt.toISOString() : null, version };
  });
}

// ── Safe delete ──────────────────────────────────────────────────────────────

export interface DeletedPosition {
  jobId: string;
  softDeleted: true;
  hardDeleted: false;
  status: "ARCHIVED";
  linked: LinkedCounts;
}

export async function softDeletePosition(jobId: string, raw: unknown, ctx: MutationContext): Promise<MutationResult<DeletedPosition>> {
  const parsed = softDeleteSchema.safeParse(raw);
  if (!parsed.success) {
    const reasonMissing = parsed.error.issues.some((i) => i.path[0] === "reason");
    return reasonMissing
      ? { ok: false, code: "REASON_REQUIRED" }
      : { ok: false, code: "INVALID_INPUT", detail: { issues: zodIssues(parsed.error) } };
  }
  const input = parsed.data;

  return runPositionMutation(ctx, "position.soft_delete", jobId, input, async (tx, now) => {
    requireCapability(ctx.actor.role, SOFT_DELETE_RULE.capability);
    const job = await loadJob(tx, ctx.organizationId, jobId);
    if (!canSoftDelete(job.status)) throw new ManagementRefusal("INVALID_TRANSITION");
    if (job.version !== input.expectedVersion) throw new ManagementRefusal("STALE");

    const counts = await linkedCounts(tx, ctx.organizationId, jobId);
    if (counts.applications !== input.confirmLinkedApplications) {
      throw new ManagementRefusal("LINKED_COUNT_CHANGED", { linkedApplications: counts.applications });
    }

    // NEVER a hard delete: the row, its criteria and every linked application,
    // candidate, review, interview and audit record stay. The position leaves
    // every listing because deletedAt is set and it is ARCHIVED and private.
    const res = await tx.atsJob.updateMany({
      where: { id: jobId, organizationId: ctx.organizationId, version: input.expectedVersion, deletedAt: null },
      data: {
        deletedAt: now,
        isPublic: false,
        status: "ARCHIVED",
        archivedAt: job.archivedAt ?? now,
        version: { increment: 1 },
      },
    });
    if (res.count !== 1) throw new ManagementRefusal("STALE");

    await audit(
      tx,
      ctx,
      "recruitment.position.soft_deleted",
      jobId,
      input.reason,
      { status: canonicalStatus(job.status), isPublic: job.isPublic, deleted: false, version: job.version },
      {
        status: "ARCHIVED",
        isPublic: false,
        deleted: true,
        hardDeleted: false,
        applicationsTouched: 0,
        candidatesTouched: 0,
        version: job.version + 1,
      },
      counts,
    );
    return { jobId, softDeleted: true as const, hardDeleted: false as const, status: "ARCHIVED" as const, linked: counts };
  });
}

// ── Initial drafts ───────────────────────────────────────────────────────────

/**
 * The five initial positions. Titles are the owner's; everything a candidate
 * is judged on comes from the reviewed role catalogue. What the catalogue
 * cannot know — the hiring owner, the location and the public description — is
 * left EMPTY, so the publish gate refuses every one of them until a person
 * completes it. They are created private and DRAFT, never opened.
 */
export const INITIAL_POSITIONS: readonly {
  roleCode: RoleCode;
  requisitionKey: string;
  title: { en: string; fa: string; de: string };
}[] = Object.freeze([
  {
    roleCode: "finance_accountant",
    requisitionKey: "HERMES-INITIAL-SENIOR-ACCOUNTANT",
    title: { en: "Senior Accountant", fa: "حسابدار ارشد", de: "Senior-Buchhalter/in" },
  },
  {
    roleCode: "automation_plc_scada_engineer",
    requisitionKey: "HERMES-INITIAL-SENIOR-AUTOMATION-ENGINEER",
    title: {
      en: "Senior Electrical and Industrial Automation Engineer",
      fa: "مهندس ارشد برق و اتوماسیون صنعتی",
      de: "Senior-Ingenieur/in Elektrotechnik und Industrieautomatisierung",
    },
  },
  {
    roleCode: "backend_engineer",
    requisitionKey: "HERMES-INITIAL-BACKEND-DEVELOPER",
    title: { en: "Backend Developer", fa: "توسعه‌دهندهٔ بک‌اند", de: "Backend-Entwickler/in" },
  },
  {
    roleCode: "ai_ml_engineer",
    requisitionKey: "HERMES-INITIAL-AI-SPECIALIST",
    title: { en: "Artificial Intelligence Specialist", fa: "متخصص هوش مصنوعی", de: "Spezialist/in für Künstliche Intelligenz" },
  },
  {
    roleCode: "b2b_technical_marketing",
    requisitionKey: "HERMES-INITIAL-SENIOR-B2B-MARKETING",
    title: { en: "Senior B2B Marketing Specialist", fa: "کارشناس ارشد بازاریابی B2B", de: "Senior B2B-Marketing-Spezialist/in" },
  },
]);

export interface InitialDraftsResult {
  created: { jobId: string; roleCode: string; requisitionKey: string }[];
  skipped: { roleCode: string; requisitionKey: string }[];
}

export async function createInitialDrafts(raw: unknown, ctx: MutationContext): Promise<MutationResult<InitialDraftsResult>> {
  const parsed = initialDraftsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "REASON_REQUIRED" };
  const { reason } = parsed.data;

  return runPositionMutation(ctx, "position.initial_drafts", null, { reason }, async (tx) => {
    requireCapability(ctx.actor.role, "ATS_ADMIN");
    const out: InitialDraftsResult = { created: [], skipped: [] };
    for (const spec of INITIAL_POSITIONS) {
      const existing = await tx.atsJob.findFirst({
        where: { organizationId: ctx.organizationId, requisitionKey: spec.requisitionKey },
        select: { id: true },
      });
      if (existing) {
        out.skipped.push({ roleCode: spec.roleCode, requisitionKey: spec.requisitionKey });
        continue;
      }
      const p = ROLE_PROFILES[spec.roleCode];
      const job = await tx.atsJob.create({
        data: {
          organizationId: ctx.organizationId,
          requisitionKey: spec.requisitionKey,
          title: spec.title.en,
          internalTitle: spec.title.en,
          department: p.department,
          location: "",
          description: "",
          requirements: [],
          responsibilities: [],
          benefits: [],
          skills: [],
          evidenceRequirements: [],
          scoringRubric: { weights: { ...p.weights } },
          interviewKit: p.interviewKit.map((s) => ({ ...s, questions: [...s.questions], rubric: s.rubric.map((r) => ({ ...r, anchors: { ...r.anchors } })) })),
          assessmentConfig: { ...p.assessment, evaluates: [...p.assessment.evaluates] },
          roleProfileCode: p.code,
          approvalOwnerRole: p.approvalOwnerRole,
          decisionSlaDays: p.decisionSlaDays,
          hiringManagerId: null,
          status: "DRAFT",
          isPublic: false,
          publishedAt: null,
          postedById: ctx.actor.userId,
          version: 0,
        },
        select: { id: true },
      });
      for (const [lang, title] of [["EN", spec.title.en], ["FA", spec.title.fa], ["DE", spec.title.de]] as const) {
        const data = { title, shortSummary: "", description: "", departmentLabel: p.department, responsibilities: [], requirements: [], preferredExperience: [], localizedSkills: {}, seoTitle: title, seoDescription: "" };
        await tx.atsJobTranslation.upsert({
          where: { jobId_language: { jobId: job.id, language: lang } },
          create: { jobId: job.id, language: lang, ...data },
          update: data,
        });
      }
      for (const [i, c] of p.criteria.entries()) {
        const code = qualifiedCriterionCode(p.code, c.code);
        const data = { label: c.label, kind: c.kind, dimension: c.dimension, weight: c.weight, keywords: [...c.keywords], minYears: c.minYears ?? null, hardGate: c.hardGate, sortOrder: i };
        await tx.atsJobCriterion.upsert({
          where: { organizationId_jobId_code: { organizationId: ctx.organizationId, jobId: job.id, code } },
          create: { organizationId: ctx.organizationId, jobId: job.id, code, ...data },
          update: data,
        });
      }
      await audit(tx, ctx, "recruitment.position.created", job.id, reason, null, {
        requisitionKey: spec.requisitionKey,
        roleProfileCode: p.code,
        status: "DRAFT",
        isPublic: false,
        languages: ["EN", "FA", "DE"],
        criteriaCount: p.criteria.length,
        source: "initial-catalogue",
        version: 0,
      });
      out.created.push({ jobId: job.id, roleCode: spec.roleCode, requisitionKey: spec.requisitionKey });
    }
    return out;
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────

export const LIST_PAGE_MAX = 100;

export interface PositionListItem {
  id: string;
  requisitionKey: string | null;
  status: string;
  isPublic: boolean;
  publishedAt: string | null;
  closingDate: string | null;
  publicTitle: string;
  internalTitle: string | null;
  titleEn: string | null;
  titleFa: string | null;
  department: string;
  location: string;
  employmentType: string | null;
  workMode: string | null;
  applicationCount: number;
  version: number;
  updatedAt: string;
  actions: ReturnType<typeof allowedActions>;
}

function capabilitySet(role: string): Set<AtsCapability> {
  return new Set((["ATS_VIEW", "ATS_REVIEW", "ATS_MANAGE", "ATS_SCORE", "ATS_INTERVIEW", "ATS_ADMIN"] as const).filter((c) => atsCan(role, c)));
}

export async function listPositions(
  organizationId: string,
  role: string,
  opts: { status?: string; take?: number; cursor?: string } = {},
): Promise<{ items: PositionListItem[]; nextCursor: string | null } | null> {
  const prisma = await client();
  if (!prisma) return null;
  const take = Math.min(Math.max(opts.take ?? 50, 1), LIST_PAGE_MAX);
  const statusFilter =
    opts.status === "PAUSED" ? { status: { in: ["PAUSED", "ON_HOLD"] } } : opts.status ? { status: opts.status } : {};
  try {
    const rows = await prisma.atsJob.findMany({
      where: { organizationId, deletedAt: null, ...statusFilter },
      // A stable key for cursor paging: an edit between page loads must not move
      // a row across the cursor (updatedAt would), so newest-created first.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        requisitionKey: true,
        status: true,
        isPublic: true,
        publishedAt: true,
        closingDate: true,
        title: true,
        internalTitle: true,
        department: true,
        location: true,
        employmentType: true,
        locationType: true,
        version: true,
        updatedAt: true,
        translations: { select: { language: true, title: true } },
        _count: { select: { applications: true } },
      },
    });
    const caps = capabilitySet(role);
    const page = rows.slice(0, take);
    return {
      items: page.map((r) => ({
        id: r.id,
        requisitionKey: r.requisitionKey,
        status: canonicalStatus(r.status) ?? r.status,
        isPublic: r.isPublic,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        closingDate: r.closingDate?.toISOString() ?? null,
        publicTitle: r.title,
        internalTitle: r.internalTitle,
        titleEn: r.translations.find((t) => t.language === "EN")?.title ?? null,
        titleFa: r.translations.find((t) => t.language === "FA")?.title ?? null,
        department: r.department,
        location: r.location,
        employmentType: r.employmentType,
        workMode: r.locationType,
        applicationCount: r._count.applications,
        version: r.version,
        updatedAt: r.updatedAt.toISOString(),
        actions: allowedActions(r.status, caps),
      })),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    };
  } catch {
    return null;
  }
}

export interface PositionDetail {
  id: string;
  requisitionKey: string | null;
  status: string;
  isPublic: boolean;
  publishedAt: string | null;
  closingDate: string | null;
  internalTitle: string | null;
  publicTitle: string;
  department: string;
  location: string;
  addressLocality: string | null;
  addressCountry: string | null;
  employmentType: string | null;
  workMode: string | null;
  sponsorshipPolicy: string | null;
  relocationPolicy: string | null;
  salary: { confidential: boolean; currency: string | null; min: number | null; max: number | null };
  internalBrief: string | null;
  evidenceRequirements: unknown;
  scoringRubric: unknown;
  interviewKit: unknown;
  assessment: unknown;
  roleProfileCode: string | null;
  approvalOwnerRole: string | null;
  decisionSlaDays: number | null;
  hiringOwnerMemberId: string | null;
  copy: Record<PositionLocale, (LocaleCopy & { present: boolean }) | null>;
  criteria: CriterionRow[];
  linked: LinkedCounts;
  readiness: ReadinessVerdict;
  actions: ReturnType<typeof allowedActions>;
  version: number;
  organizationId: string;
  pausedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function copyOf(rows: readonly TranslationRow[], lang: string): (LocaleCopy & { present: boolean }) | null {
  const t = rows.find((r) => r.language === lang);
  if (!t) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    present: true,
    title: t.title,
    summary: t.shortSummary,
    description: t.description,
    responsibilities: list(t.responsibilities),
    requirements: list(t.requirements),
    preferredExperience: list(t.preferredExperience),
  };
}

export async function getPositionDetail(
  organizationId: string,
  role: string,
  jobId: string,
  now: Date = new Date(),
): Promise<PositionDetail | "NOT_FOUND" | null> {
  const prisma = await client();
  if (!prisma) return null;
  try {
    const job = await prisma.atsJob.findFirst({
      where: { id: jobId, organizationId, deletedAt: null },
      include: JOB_WITH_CONTENT,
    });
    if (!job) return "NOT_FOUND";
    const [linked, settings] = await Promise.all([linkedCounts(prisma, organizationId, jobId), readSettingsOrDefaults(prisma, organizationId)]);
    const translations = job.translations ?? [];
    return {
      id: job.id,
      organizationId: job.organizationId,
      requisitionKey: job.requisitionKey,
      status: canonicalStatus(job.status) ?? job.status,
      isPublic: job.isPublic,
      publishedAt: job.publishedAt?.toISOString() ?? null,
      closingDate: job.closingDate?.toISOString() ?? null,
      internalTitle: job.internalTitle,
      publicTitle: job.title,
      department: job.department,
      location: job.location,
      addressLocality: job.addressLocality,
      addressCountry: job.addressCountry,
      employmentType: job.employmentType,
      workMode: job.locationType,
      sponsorshipPolicy: job.sponsorshipPolicy,
      relocationPolicy: job.relocationPolicy,
      salary: { confidential: job.salaryConfidential, currency: job.salaryCurrency, min: job.salaryMin, max: job.salaryMax },
      internalBrief: job.internalBrief,
      evidenceRequirements: job.evidenceRequirements,
      scoringRubric: job.scoringRubric,
      interviewKit: job.interviewKit,
      assessment: job.assessmentConfig,
      roleProfileCode: job.roleProfileCode,
      approvalOwnerRole: job.approvalOwnerRole,
      decisionSlaDays: job.decisionSlaDays,
      hiringOwnerMemberId: job.hiringManagerId,
      copy: { en: copyOf(translations, "EN"), fa: copyOf(translations, "FA"), de: copyOf(translations, "DE") },
      criteria: job.criteria ?? [],
      linked,
      readiness: readinessOf(job, settings.defaultPublicLocale, now),
      actions: allowedActions(job.status, capabilitySet(role)),
      version: job.version,
      pausedAt: job.pausedAt?.toISOString() ?? null,
      closedAt: job.closedAt?.toISOString() ?? null,
      archivedAt: job.archivedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  } catch {
    return null;
  }
}

export const AUDIT_PAGE_MAX = 100;

export interface PositionAuditEntry {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  at: string;
  correlationId: string | null;
  outcome: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  affectedCounts: unknown;
}

/**
 * The audit history of one position, newest first. Organization-scoped at the
 * query; a soft-deleted position of the SAME organization keeps its history
 * readable (that is what the trail is for). Rows are read, never written.
 */
export async function listPositionAudit(
  organizationId: string,
  jobId: string,
  take = 50,
): Promise<PositionAuditEntry[] | "NOT_FOUND" | null> {
  const prisma = await client();
  if (!prisma) return null;
  try {
    const job = await prisma.atsJob.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
    if (!job) return "NOT_FOUND";
    const rows = await prisma.auditLog.findMany({
      where: { organizationId, entityType: "AtsJob", entityId: jobId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(take, 1), AUDIT_PAGE_MAX),
      select: { id: true, action: true, userId: true, createdAt: true, correlationId: true, outcome: true, metadata: true },
    });
    const userIds = [...new Set(rows.map((r) => r.userId).filter((u): u is string => !!u))];
    const members = userIds.length
      ? await prisma.organizationMember.findMany({
          where: { organizationId, userId: { in: userIds } },
          select: { id: true, role: true, userId: true, user: { select: { name: true } } },
        })
      : [];
    const nameOf = new Map(members.map((m) => [m.userId ?? "", m.user?.name ?? null]));
    return rows.map((r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        action: r.action,
        actorUserId: r.userId,
        actorName: r.userId ? (nameOf.get(r.userId) ?? null) : null,
        at: r.createdAt.toISOString(),
        correlationId: r.correlationId,
        outcome: r.outcome,
        reason: typeof m.reason === "string" ? m.reason : null,
        before: m.before ?? null,
        after: m.after ?? null,
        affectedCounts: m.affectedCounts ?? null,
      };
    });
  } catch {
    return null;
  }
}

export const OWNER_PICKER_MAX = 500;

/** ACTIVE members of the organization, for the hiring-owner picker (bounded). */
export async function listOwnerCandidates(organizationId: string): Promise<{ memberId: string; role: string; name: string | null }[] | null> {
  const prisma = await client();
  if (!prisma) return null;
  try {
    const rows = await prisma.organizationMember.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      take: OWNER_PICKER_MAX,
      select: { id: true, role: true, user: { select: { name: true } } },
    });
    return rows.map((r) => ({ memberId: r.id, role: r.role, name: r.user?.name ?? null }));
  } catch {
    return null;
  }
}
