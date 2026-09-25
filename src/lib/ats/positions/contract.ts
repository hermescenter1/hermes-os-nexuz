/**
 * ATS-M1 — the position-management CONTRACT, shared by the API routes, the
 * domain service and the dashboard forms.
 *
 * Dependency-free apart from zod and type-only imports, on purpose: a
 * `"use client"` form imports the same schemas the server enforces, so the
 * two can never disagree about what a valid position is. Nothing here
 * authorizes anything — every route re-checks the actor on the server.
 *
 * Every object schema is `.strict()`: an unknown key is a 400, so a client can
 * never smuggle `organizationId`, `status`, `isPublic`, `publishedAt` or
 * `deletedAt` into a write. The tenant comes from the authenticated context,
 * the lifecycle only from a transition.
 */

import { z } from "zod";
import { DIMENSIONS } from "@/lib/ats/review/report-schema";

// ── Vocabularies ─────────────────────────────────────────────────────────────

/** Canonical lifecycle. The stored legacy ON_HOLD reads as PAUSED. */
export const POSITION_STATUSES = ["DRAFT", "OPEN", "PAUSED", "CLOSED", "ARCHIVED"] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];

export const POSITION_ACTIONS = ["PUBLISH", "PAUSE", "RESUME", "CLOSE", "REOPEN", "ARCHIVE"] as const;
export type PositionAction = (typeof POSITION_ACTIONS)[number];

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** Stored in the existing AtsJob.locationType column (its B1 vocabulary). */
export const WORK_MODES = ["onsite", "remote", "hybrid"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const MOBILITY_POLICIES = ["NOT_OFFERED", "CASE_BY_CASE", "OFFERED"] as const;
export type MobilityPolicy = (typeof MOBILITY_POLICIES)[number];

export const CRITERION_KINDS = ["MUST_HAVE", "NICE_TO_HAVE", "DISQUALIFIER"] as const;

/** The role catalogue's interview-stage vocabulary (src/lib/ats/review/catalog.ts). */
export const INTERVIEW_STAGE_KINDS = [
  "RECRUITER_SCREEN",
  "TECHNICAL_FUNCTIONAL",
  "BEHAVIORAL_COMMUNICATION",
  "FINAL_REVIEW",
  "REFERENCE_OFFER_READINESS",
] as const;

export const ASSESSMENT_FORMATS = ["TAKE_HOME", "LIVE_EXERCISE", "CASE_STUDY", "PORTFOLIO_REVIEW"] as const;

/** Roles that hold ATS_REVIEW (src/lib/ats/rbac.ts) — the only valid gate owners. */
export const APPROVAL_OWNER_ROLES = ["OWNER", "ADMIN", "HR_MANAGER", "RECRUITER", "HIRING_MANAGER"] as const;
export type ApprovalOwnerRole = (typeof APPROVAL_OWNER_ROLES)[number];

/** Roles an interview stage may be owned by (those holding ATS_INTERVIEW). */
export const INTERVIEW_OWNER_ROLES = ["OWNER", "ADMIN", "HR_MANAGER", "RECRUITER", "HIRING_MANAGER", "INTERVIEWER"] as const;

export const PUBLIC_LOCALES = ["en", "fa", "de"] as const;
export type PositionLocale = (typeof PUBLIC_LOCALES)[number];

export const SLA_DAYS_MIN = 1;
export const SLA_DAYS_MAX = 90;

// ── Building blocks ──────────────────────────────────────────────────────────

const line = (max: number) => z.string().trim().min(1).max(max);
const lines = (maxItems: number, maxLen: number) => z.array(line(maxLen)).max(maxItems);

/** A written justification. Short enough to be read, long enough to mean something. */
export const reasonSchema = z.string().trim().min(5).max(2000);

export const criterionInputSchema = z
  .object({
    /** Stable per-position code; generated from the label when absent. */
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9_.-]{0,79}$/)
      .optional(),
    label: line(200),
    dimension: z.enum(DIMENSIONS),
    weight: z.number().int().min(0).max(100).default(0),
    keywords: lines(24, 80).default([]),
    minYears: z.number().int().min(0).max(40).nullable().optional(),
    hardGate: z.boolean().default(false),
  })
  .strict();
export type CriterionInput = z.infer<typeof criterionInputSchema>;

export const criteriaInputSchema = z
  .object({
    mustHave: z.array(criterionInputSchema).max(24).default([]),
    niceToHave: z.array(criterionInputSchema).max(24).default([]),
    disqualifiers: z.array(criterionInputSchema).max(12).default([]),
  })
  .strict();
export type CriteriaInput = z.infer<typeof criteriaInputSchema>;

/** Dimension weights of the scoring rubric; must total exactly 100. */
export const scoringRubricSchema = z
  .object({
    weights: z
      .object(Object.fromEntries(DIMENSIONS.map((d) => [d, z.number().int().min(0).max(100)])) as Record<
        (typeof DIMENSIONS)[number],
        z.ZodNumber
      >)
      .strict(),
  })
  .strict()
  .refine((r) => Object.values(r.weights).reduce((a, b) => a + b, 0) === 100, {
    message: "rubric weights must total 100",
    path: ["weights"],
  });
export type ScoringRubric = z.infer<typeof scoringRubricSchema>;

const rubricItemSchema = z
  .object({
    item: line(200),
    anchors: z.object({ low: line(300), mid: line(300), high: line(300) }).strict(),
  })
  .strict();

export const interviewStageSchema = z
  .object({
    code: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/),
    kind: z.enum(INTERVIEW_STAGE_KINDS),
    label: line(120),
    ownerRole: z.enum(INTERVIEW_OWNER_ROLES),
    slaDays: z.number().int().min(SLA_DAYS_MIN).max(SLA_DAYS_MAX),
    durationMinutes: z.number().int().min(10).max(480),
    questions: lines(20, 400),
    rubric: z.array(rubricItemSchema).max(12).default([]),
    policyGated: z.boolean().optional(),
  })
  .strict();
export type InterviewStageInput = z.infer<typeof interviewStageSchema>;

export const interviewKitSchema = z
  .array(interviewStageSchema)
  .max(8)
  .refine((stages) => new Set(stages.map((s) => s.code)).size === stages.length, {
    message: "interview stage codes must be unique",
  });

export const assessmentSchema = z
  .object({
    title: line(200),
    format: z.enum(ASSESSMENT_FORMATS),
    durationMinutes: z.number().int().min(10).max(2880),
    evaluates: lines(12, 200),
    submission: line(600),
  })
  .strict();
export type AssessmentInput = z.infer<typeof assessmentSchema>;

/** One locale's public copy. Only `title` is needed to save a draft. */
export const localeCopySchema = z
  .object({
    title: z.string().trim().max(200).default(""),
    summary: z.string().trim().max(500).default(""),
    description: z.string().trim().max(20000).default(""),
    responsibilities: lines(40, 400).default([]),
    requirements: lines(40, 400).default([]),
    preferredExperience: lines(40, 400).default([]),
  })
  .strict();
export type LocaleCopy = z.infer<typeof localeCopySchema>;

const salarySchema = z
  .object({
    confidential: z.boolean(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/).nullable().optional(),
    min: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    max: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  })
  .strict()
  .refine((s) => s.min == null || s.max == null || s.min <= s.max, { message: "salary min exceeds max", path: ["max"] })
  .refine((s) => (s.min == null && s.max == null) || !!s.currency, {
    message: "a salary range needs a currency",
    path: ["currency"],
  });

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "invalid date" });

// ── Create / update ──────────────────────────────────────────────────────────

const positionFields = {
  requisitionKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,119}$/)
    .optional(),
  internalTitle: line(200),
  /** The listing title (legacy AtsJob.title); the per-locale titles are in `copy`. */
  publicTitle: line(200),
  department: line(120),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable().optional(),
  workMode: z.enum(WORK_MODES).nullable().optional(),
  location: line(200),
  addressLocality: z.string().trim().min(1).max(120).nullable().optional(),
  addressCountry: z.string().trim().length(2).nullable().optional(),
  sponsorshipPolicy: z.enum(MOBILITY_POLICIES).nullable().optional(),
  relocationPolicy: z.enum(MOBILITY_POLICIES).nullable().optional(),
  salary: salarySchema.optional(),
  internalBrief: z.string().trim().max(20000).nullable().optional(),
  evidenceRequirements: lines(24, 300).optional(),
  criteria: criteriaInputSchema.optional(),
  // null clears a stored rubric / assessment; an empty kit is [].
  scoringRubric: scoringRubricSchema.nullable().optional(),
  interviewKit: interviewKitSchema.optional(),
  assessment: assessmentSchema.nullable().optional(),
  /** OrganizationMember.id of the hiring owner — re-proven ACTIVE in the same organization. */
  hiringOwnerMemberId: z.string().trim().min(1).max(64).nullable().optional(),
  approvalOwnerRole: z.enum(APPROVAL_OWNER_ROLES).nullable().optional(),
  decisionSlaDays: z.number().int().min(SLA_DAYS_MIN).max(SLA_DAYS_MAX).nullable().optional(),
  closingDate: isoDate.nullable().optional(),
  roleProfileCode: z.string().trim().min(1).max(64).nullable().optional(),
  copy: z
    .object({
      en: localeCopySchema,
      fa: localeCopySchema,
      de: localeCopySchema.optional(),
    })
    .strict(),
};

const positionObject = z.object(positionFields).strict();

export const createPositionSchema = positionObject.refine(
  (p) => p.copy.en.title.length > 0 && p.copy.fa.title.length > 0,
  { message: "an English and a Persian title are required", path: ["copy"] },
);
export type CreatePositionInput = z.infer<typeof createPositionSchema>;

/**
 * An edit: any subset of the editable fields plus the version the editor
 * loaded. The requisition key is immutable once created (omitted, so sending
 * it is an unknown key and a 400).
 */
export const updatePositionSchema = positionObject
  .omit({ requisitionKey: true })
  .partial()
  .extend({ expectedVersion: z.number().int().min(0) })
  .strict();
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;

// ── Lifecycle ────────────────────────────────────────────────────────────────

export const transitionSchema = z
  .object({
    action: z.enum(POSITION_ACTIONS),
    expectedVersion: z.number().int().min(0),
    reason: reasonSchema.optional(),
    /** PUBLISH / REOPEN only: PUBLIC lists it on the careers site, INTERNAL does not. */
    visibility: z.enum(["PUBLIC", "INTERNAL"]).optional(),
    /** PUBLISH only: when it becomes visible; defaults to now. Never in the past by more than a minute. */
    openingDate: isoDate.optional(),
    /** PUBLISH / REOPEN: a closing date that replaces the stored one. */
    closingDate: isoDate.nullable().optional(),
  })
  .strict();
export type TransitionInput = z.infer<typeof transitionSchema>;

export const softDeleteSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    reason: reasonSchema,
    /**
     * The linked-application count the operator was SHOWN. It must equal the
     * count at write time, so a confirmation given against a stale number is
     * refused instead of silently applied.
     */
    confirmLinkedApplications: z.number().int().min(0),
  })
  .strict();
export type SoftDeleteInput = z.infer<typeof softDeleteSchema>;

export const initialDraftsSchema = z
  .object({
    reason: reasonSchema,
  })
  .strict();

// ── Readiness vocabulary (shared so the UI can render each missing item) ────

export const READINESS_CODES = [
  "PUBLIC_TITLE_MISSING",
  "TITLE_EN_MISSING",
  "TITLE_FA_MISSING",
  "DESCRIPTION_EN_MISSING",
  "DESCRIPTION_FA_MISSING",
  "SUMMARY_EN_MISSING",
  "SUMMARY_FA_MISSING",
  "DEFAULT_LOCALE_INCOMPLETE",
  "MUST_HAVE_MISSING",
  "DISQUALIFIER_MISSING",
  "RUBRIC_MISSING",
  "INTERVIEW_KIT_MISSING",
  "HIRING_OWNER_MISSING",
  "APPROVAL_OWNER_MISSING",
  "SLA_MISSING",
  "PROTECTED_TERM",
  "CLOSING_DATE_PASSED",
  "LOCATION_MISSING",
] as const;
export type ReadinessCode = (typeof READINESS_CODES)[number];

/** Stable machine codes every refusal of this surface carries. */
export const POSITION_ERROR_CODES = [
  "INVALID_INPUT",
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_KEY_REUSED",
  "IDEMPOTENCY_IN_PROGRESS",
  "NOT_FOUND",
  "STALE",
  "INVALID_TRANSITION",
  "NOT_READY",
  "PROTECTED_TERM",
  "REASON_REQUIRED",
  "FORBIDDEN",
  "CONFLICT",
  "LINKED_COUNT_CHANGED",
  "HIRING_OWNER_INVALID",
  "STORE_UNAVAILABLE",
  "WRITE_FAILED",
] as const;
export type PositionErrorCode = (typeof POSITION_ERROR_CODES)[number];
