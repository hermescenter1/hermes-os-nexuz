/**
 * ATS-S1 — the AI review report contract.
 *
 * Every claim in a report points at evidence: a SOURCE (which field it came
 * from), a SPAN (where in that field), a QUOTE (≤ 200 chars of the original)
 * and a CONFIDENCE. A claim without evidence cannot be constructed — the
 * schema refuses it — and `unknown` is a first-class value, never coerced.
 *
 * The schema is the storage contract for `AtsAiReview.report` and the
 * completeness gate for every provider: a report that does not parse is a
 * failed review, which leaves the application in AI_REVIEW_PENDING.
 */

import { z } from "zod";

export const EVIDENCE_SOURCES = [
  "resumeText",
  "fitStatement",
  "keySkills",
  "yearsExperience",
  "currentLocation",
  "linkedinUrl",
  "notCollected",
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

export const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const evidenceSchema = z
  .object({
    source: z.enum(EVIDENCE_SOURCES),
    /** Character offsets in the source field; null for a structured field. */
    span: z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }).nullable(),
    quote: z.string().max(200),
    confidence: z.enum(CONFIDENCE_LEVELS),
    extractedAt: z.string().datetime(),
    extractorVersion: z.string().min(1),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;

export const HARD_GATE_OUTCOMES = ["PASS", "FAIL", "UNKNOWN"] as const;

export const hardGateResultSchema = z
  .object({
    criterionCode: z.string().min(1),
    label: z.string().min(1),
    outcome: z.enum(HARD_GATE_OUTCOMES),
    /** Required for PASS and FAIL; empty ONLY for UNKNOWN. */
    evidence: z.array(evidenceSchema),
    note: z.string().max(400),
  })
  .strict()
  .refine((g) => g.outcome === "UNKNOWN" || g.evidence.length > 0, {
    message: "a PASS or FAIL hard gate must cite evidence",
  })
  .refine((g) => g.outcome !== "UNKNOWN" || g.evidence.length === 0, {
    message: "an UNKNOWN hard gate cites no evidence by definition",
  });
export type HardGateResult = z.infer<typeof hardGateResultSchema>;

export const criterionMatchSchema = z
  .object({
    criterionCode: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(["MUST_HAVE", "NICE_TO_HAVE", "DISQUALIFIER"]),
    dimension: z.string().min(1),
    weight: z.number().int().min(0).max(100),
    evidence: z.array(evidenceSchema).min(1),
  })
  .strict();
export type CriterionMatch = z.infer<typeof criterionMatchSchema>;

export const missingEvidenceSchema = z
  .object({
    criterionCode: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(["MUST_HAVE", "NICE_TO_HAVE", "DISQUALIFIER"]),
    dimension: z.string().min(1),
    /** What the reviewer should ask for. Never a guess at the answer. */
    ask: z.string().min(1).max(300),
  })
  .strict();

export const contradictionSchema = z
  .object({
    topic: z.string().min(1),
    a: evidenceSchema,
    b: evidenceSchema,
    note: z.string().max(400),
  })
  .strict();

export const RISK_FLAG_CODES = [
  "PROMPT_INJECTION_SUSPECTED",
  "RESUME_TEXT_ABSENT",
  "EXPERIENCE_CONTRADICTION",
  "LOCATION_UNKNOWN",
  "WORK_AUTHORIZATION_NOT_COLLECTED",
  "SALARY_NOT_COLLECTED",
  "DISQUALIFIER_EVIDENCE",
  "LOW_EVIDENCE_COVERAGE",
  // ATS-M1 — the organization's minimum-confidence policy. A flag, never a transition.
  "CONFIDENCE_BELOW_POLICY",
] as const;

export const riskFlagSchema = z
  .object({
    code: z.enum(RISK_FLAG_CODES),
    note: z.string().max(400),
    evidence: z.array(evidenceSchema),
  })
  .strict();

export const DIMENSIONS = [
  "skill",
  "experience",
  "education",
  "certification",
  "project",
  "role_relevance",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const dimensionScoreSchema = z
  .object({
    dimension: z.enum(DIMENSIONS),
    /** 0..100, or null when the rubric defines no criteria in this dimension. */
    score: z.number().int().min(0).max(100).nullable(),
    weightApplied: z.number().int().min(0).max(100),
    matched: z.number().int().min(0),
    total: z.number().int().min(0),
  })
  .strict();

/** A field that was either observed or explicitly unknown — never assumed. */
const observedString = z.union([
  z.object({ status: z.literal("OBSERVED"), value: z.string(), evidence: evidenceSchema }).strict(),
  z.object({ status: z.literal("UNKNOWN"), reason: z.string().min(1) }).strict(),
]);
const observedNumber = z.union([
  z.object({ status: z.literal("OBSERVED"), value: z.number(), evidence: evidenceSchema }).strict(),
  z.object({ status: z.literal("UNKNOWN"), reason: z.string().min(1) }).strict(),
]);

export const aiReviewReportSchema = z
  .object({
    schemaVersion: z.literal("ats-review-report-1"),
    extractorVersion: z.string().min(1),
    rubricVersion: z.string().min(1),
    promptVersion: z.string().min(1),
    policyVersion: z.string().min(1),
    provider: z.string().min(1),
    modelVersion: z.string().nullable(),
    generatedAt: z.string().datetime(),
    roleCode: z.string().min(1),

    matchedSkills: z.array(criterionMatchSchema),
    missingSkills: z.array(missingEvidenceSchema),
    experience: z
      .object({
        years: observedNumber,
        evidence: z.array(evidenceSchema),
      })
      .strict(),
    education: z.array(criterionMatchSchema),
    certifications: z.array(criterionMatchSchema),
    projects: z.array(criterionMatchSchema),
    roleRelevance: z.array(criterionMatchSchema),
    locationAvailability: observedString,
    workAuthorization: observedString,
    salaryFit: z
      .union([
        z.object({ status: z.literal("NOT_COLLECTED"), reason: z.string().min(1) }).strict(),
        z.object({ status: z.literal("OBSERVED"), note: z.string(), evidence: evidenceSchema }).strict(),
      ]),

    contradictions: z.array(contradictionSchema),
    missingEvidence: z.array(missingEvidenceSchema),
    riskFlags: z.array(riskFlagSchema),

    hardGates: z.array(hardGateResultSchema),
    dimensionScores: z.array(dimensionScoreSchema),
    overallScore: z.number().int().min(0).max(100).nullable(),
    confidence: z.number().int().min(0).max(100),
    recommendation: z.enum(["ADVANCE", "REVIEW_REQUIRED", "HOLD", "REJECT_RECOMMENDED"]),
    explanation: z.string().min(1).max(4000),

    /** The stage gate, stated in the report itself so a reader cannot miss it. */
    humanReview: z
      .object({
        status: z.literal("PENDING_HUMAN_APPROVAL"),
        note: z.literal("This report is advisory. No transition occurs without a recorded human decision."),
      })
      .strict(),
  })
  .strict();

export type AiReviewReport = z.infer<typeof aiReviewReportSchema>;

/** Parse-or-throw for storage; the worker treats a throw as a failed review. */
export function assertReport(value: unknown): AiReviewReport {
  return aiReviewReportSchema.parse(value);
}
