/**
 * PHASE 104-B1 — the ONE public-eligibility contract for job postings.
 *
 * Every public surface — /api/careers/jobs, /api/careers/jobs/[jobId],
 * /api/careers/apply, the sitemap and the JobPosting structured-data builder —
 * derives its predicate from here. A job is publicly visible when, and only
 * when, ALL of:
 *
 *   status       = OPEN
 *   isPublic     = true
 *   deletedAt    = null
 *   publishedAt  is set AND not in the future   (never derived from createdAt)
 *   closingDate  is null OR not yet passed
 *
 * and a CONTENT surface additionally requires the translation row of the
 * requested locale to be complete. Draft, private, closed, expired and
 * non-existent ids must be indistinguishable to an anonymous caller.
 *
 * This module is dependency-free on purpose (no Prisma import): both
 * `src/lib/ats/db.ts` and `src/lib/ats/public-jobs.ts` consume it without a
 * cycle, and tests can assert the exact clauses.
 */

export type AtsPublicLocale = "en" | "de" | "fa";

export const ATS_JOB_LANGUAGES = ["EN", "DE", "FA"] as const;
export type AtsJobLanguageCode = (typeof ATS_JOB_LANGUAGES)[number];

export function localeToJobLanguage(locale: string): AtsJobLanguageCode {
  const up = locale.toUpperCase();
  return (ATS_JOB_LANGUAGES as readonly string[]).includes(up)
    ? (up as AtsJobLanguageCode)
    : "EN";
}

/** The Prisma `where` for a publicly eligible job, evaluated at `now`. */
export function publicJobWhere(now: Date) {
  return {
    status: "OPEN",
    isPublic: true,
    deletedAt: null,
    publishedAt: { not: null, lte: now },
    OR: [{ closingDate: null }, { closingDate: { gte: now } }],
  } as const;
}

/** Row shape the in-memory predicate needs — a projection, not a model. */
export interface PublicEligibilityRow {
  status: string;
  isPublic: boolean;
  publishedAt?: Date | null;
  closingDate?: Date | null;
  deletedAt?: Date | null;
}

/** The same contract as `publicJobWhere`, for a row already in memory. */
export function isJobPubliclyEligible(job: PublicEligibilityRow, now: Date = new Date()): boolean {
  if (job.status !== "OPEN") return false;
  if (job.isPublic !== true) return false;
  if (job.deletedAt != null) return false;
  if (!(job.publishedAt instanceof Date) || job.publishedAt.getTime() > now.getTime()) return false;
  if (job.closingDate instanceof Date && job.closingDate.getTime() < now.getTime()) return false;
  return true;
}

/** Minimal translation shape a content surface must have to render a locale. */
export interface JobTranslationRow {
  language: string;
  title: string;
  shortSummary: string;
  description: string;
  departmentLabel: string;
  seoTitle: string;
  seoDescription: string;
}

/**
 * A translation row is COMPLETE when every visible string is non-empty.
 * A locale without a complete row must not be served that locale's page —
 * three canonicals over one English body is the hreflang failure the Journal
 * already fixed once.
 */
export function isTranslationComplete(t: JobTranslationRow | null | undefined): boolean {
  if (!t) return false;
  return [t.title, t.shortSummary, t.description, t.departmentLabel, t.seoTitle, t.seoDescription]
    .every((v) => typeof v === "string" && v.trim().length > 0);
}

export const JOB_LANGUAGE_TO_LOCALE: Readonly<Record<string, AtsPublicLocale>> = {
  EN: "en",
  DE: "de",
  FA: "fa",
};

/**
 * B1.2 — THE locale-truth primitive. Given a job's translation rows, the
 * ordered list of public locales whose translation is COMPLETE (trim-based,
 * via `isTranslationComplete` — whitespace-only never counts). Every consumer
 * of "which locales does this job really have?" — the posting projection, the
 * page metadata (canonical/hreflang/OG), and the sitemap — derives from THIS
 * function, so they cannot disagree and there is no parallel predicate.
 */
export function completeLocalesOf(
  translations: readonly (JobTranslationRow & { language: string })[] | null | undefined,
): AtsPublicLocale[] {
  const order: AtsPublicLocale[] = ["en", "de", "fa"];
  const complete = new Set<AtsPublicLocale>();
  for (const t of translations ?? []) {
    const locale = JOB_LANGUAGE_TO_LOCALE[String(t.language)];
    if (locale && isTranslationComplete(t)) complete.add(locale);
  }
  return order.filter((l) => complete.has(l));
}
