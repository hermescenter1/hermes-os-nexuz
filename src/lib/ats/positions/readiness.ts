/**
 * ATS-M1 — the publish gate.
 *
 * A position may go OPEN (PUBLISH, RESUME, REOPEN) only when every item below
 * holds. The list is the owner's rule, verbatim: title, description, must-have
 * criteria, disqualifiers, rubric, hiring owner, approval owner and SLA — plus
 * the interview kit the initial drafts must carry, the bilingual copy the
 * careers site renders, and no protected characteristic anywhere a candidate
 * is judged.
 *
 * Pure and deterministic: given the same stored position it returns the same
 * verdict, in a stable order, and it never fills a gap — a missing value is
 * reported, never defaulted. The hiring owner's MEMBERSHIP is re-proven by the
 * service inside the write transaction; here only its presence is checked.
 */

import { findProtectedTerms } from "@/lib/ats/policy";
import { isTranslationComplete } from "@/lib/ats/eligibility";
import {
  interviewKitSchema,
  scoringRubricSchema,
  type ReadinessCode,
  type PositionLocale,
  SLA_DAYS_MIN,
  SLA_DAYS_MAX,
  APPROVAL_OWNER_ROLES,
} from "./contract";

export interface ReadinessTranslation {
  language: string; // EN | FA | DE
  title: string;
  shortSummary: string;
  description: string;
  departmentLabel: string;
  seoTitle: string;
  seoDescription: string;
}

export interface ReadinessCriterion {
  kind: string;
  label: string;
  keywords: unknown;
}

export interface ReadinessInput {
  title: string;
  hiringManagerId: string | null;
  approvalOwnerRole: string | null;
  decisionSlaDays: number | null;
  scoringRubric: unknown;
  interviewKit: unknown;
  assessmentConfig: unknown;
  evidenceRequirements: unknown;
  closingDate: Date | null;
  translations: readonly ReadinessTranslation[];
  criteria: readonly ReadinessCriterion[];
  defaultLocale: PositionLocale;
}

export interface ReadinessVerdict {
  ready: boolean;
  missing: ReadinessCode[];
  /** Protected terms found, for the error message; empty when clean. */
  protectedTerms: string[];
}

function translationOf(rows: readonly ReadinessTranslation[], lang: string): ReadinessTranslation | undefined {
  return rows.find((t) => String(t.language).toUpperCase() === lang);
}

function blank(v: string | null | undefined): boolean {
  return typeof v !== "string" || v.trim().length === 0;
}

/** Every string a candidate is judged against — the protected-term scan surface. */
export function judgedStrings(input: Pick<ReadinessInput, "criteria" | "interviewKit" | "assessmentConfig" | "evidenceRequirements">): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  for (const c of input.criteria) {
    out.push(c.label);
    walk(c.keywords);
  }
  walk(input.interviewKit);
  walk(input.assessmentConfig);
  walk(input.evidenceRequirements);
  return out;
}

export function scanProtectedTerms(strings: readonly string[]): string[] {
  const hits = new Set<string>();
  for (const s of strings) for (const t of findProtectedTerms(s)) hits.add(t);
  return [...hits];
}

export function evaluatePublishReadiness(input: ReadinessInput, now: Date = new Date()): ReadinessVerdict {
  const missing: ReadinessCode[] = [];
  const en = translationOf(input.translations, "EN");
  const fa = translationOf(input.translations, "FA");

  if (blank(input.title)) missing.push("PUBLIC_TITLE_MISSING");
  if (blank(en?.title)) missing.push("TITLE_EN_MISSING");
  if (blank(fa?.title)) missing.push("TITLE_FA_MISSING");
  if (blank(en?.description)) missing.push("DESCRIPTION_EN_MISSING");
  if (blank(fa?.description)) missing.push("DESCRIPTION_FA_MISSING");
  if (blank(en?.shortSummary)) missing.push("SUMMARY_EN_MISSING");
  if (blank(fa?.shortSummary)) missing.push("SUMMARY_FA_MISSING");
  if (!isTranslationComplete(translationOf(input.translations, input.defaultLocale.toUpperCase()))) {
    missing.push("DEFAULT_LOCALE_INCOMPLETE");
  }

  if (!input.criteria.some((c) => c.kind === "MUST_HAVE")) missing.push("MUST_HAVE_MISSING");
  if (!input.criteria.some((c) => c.kind === "DISQUALIFIER")) missing.push("DISQUALIFIER_MISSING");
  if (!scoringRubricSchema.safeParse(input.scoringRubric).success) missing.push("RUBRIC_MISSING");
  const kit = interviewKitSchema.safeParse(input.interviewKit);
  if (!kit.success || kit.data.length === 0) missing.push("INTERVIEW_KIT_MISSING");

  if (blank(input.hiringManagerId)) missing.push("HIRING_OWNER_MISSING");
  if (!input.approvalOwnerRole || !(APPROVAL_OWNER_ROLES as readonly string[]).includes(input.approvalOwnerRole)) {
    missing.push("APPROVAL_OWNER_MISSING");
  }
  if (
    typeof input.decisionSlaDays !== "number" ||
    !Number.isInteger(input.decisionSlaDays) ||
    input.decisionSlaDays < SLA_DAYS_MIN ||
    input.decisionSlaDays > SLA_DAYS_MAX
  ) {
    missing.push("SLA_MISSING");
  }

  const protectedTerms = scanProtectedTerms(judgedStrings(input));
  if (protectedTerms.length > 0) missing.push("PROTECTED_TERM");

  if (input.closingDate && input.closingDate.getTime() < now.getTime()) missing.push("CLOSING_DATE_PASSED");

  return { ready: missing.length === 0, missing, protectedTerms };
}
