/**
 * DISCOVERY-2A — the ONE authoritative source of public job facts.
 *
 * THE PROBLEM THIS CLOSES
 * -----------------------
 * `src/lib/ats/mock-data.ts` is a development fixture. It contains five
 * invented vacancies with invented salary bands, invented cities, invented visa
 * sponsorship and invented posting dates. Three PUBLIC DISCOVERY SURFACES were
 * importing it directly and bypassing the database entirely:
 *
 *   - `src/app/sitemap.ts` advertised fifteen `/careers/{id}` URLs;
 *   - `src/app/[locale]/careers/[jobId]/page.tsx` emitted `JobPosting`
 *     structured data — the format Google Jobs ingests — carrying those salaries
 *     and locations as fact;
 *   - `src/app/[locale]/admin/seo/page.tsx` counted them as real routes.
 *
 * The API routes under `/api/careers` already did the right thing: they read the
 * database first and only fell back to the fixture, tagging the response
 * `source: "mock"`. The defect was never a missing authority — `AtsJob` and
 * `getPublicJobs()` exist and carry the correct predicate — it was that the
 * surfaces search engines read never consulted it.
 *
 * THE RULE
 * --------
 * Public discovery FAILS EMPTY. When the database is unavailable this module
 * returns `[]` / `null` and the sitemap simply omits the family, exactly as every
 * other DB-backed branch of `src/app/sitemap.ts` already does. It NEVER falls
 * back to the fixture, because a search engine cannot tell a fixture from a fact.
 *
 * This module must not import `@/lib/ats/mock-data`, and neither may any module
 * that feeds a discovery surface;
 * `src/lib/ats/__tests__/production-boundary.test.ts` enforces both.
 *
 * Rendering is a separate concern: `/careers` and `/careers/{id}` keep working in
 * development against the fixture through `JobDetailClient` and the API. What
 * changes is that a fixture-backed page is `noindex`, emits no `JobPosting`, and
 * is not advertised anywhere.
 */

import { getPublicJobs, getJobById, type DbAtsJob } from "./db";

/** The public predicate, restated once so every caller applies the same one. */
export function isPubliclyListedJob(job: DbAtsJob): boolean {
  return job.status === "OPEN" && job.isPublic === true;
}

/**
 * Every job the public site may advertise, or `[]` when the database is not
 * reachable. Never throws, never falls back to fixture data.
 */
export async function listPublicJobs(): Promise<DbAtsJob[]> {
  try {
    const rows = await getPublicJobs();
    if (rows === null) return [];
    // `getPublicJobs` already pins `status`/`isPublic` in the query; re-applying
    // the predicate here means a future change to that query cannot silently
    // widen what the sitemap advertises.
    return rows.filter(isPubliclyListedJob);
  } catch {
    return [];
  }
}

/**
 * One authoritative public job, or `null`.
 *
 * `null` means "there is no public job with this id that this deployment can
 * prove" — an unknown id, a DRAFT or CLOSED posting, a non-public posting, an
 * unreachable database, and an id that exists only in the development fixture
 * all return it. Callers answer identically: render the page, but do not index
 * it and do not describe it as a vacancy in structured data.
 *
 * `getJobById` is a generic lookup shared with authenticated routes and filters
 * only `deletedAt`, so the public predicate is applied here — the same guard the
 * public API route applies (see the PHASE 99 SECURITY note in
 * `src/app/api/careers/jobs/[jobId]/route.ts`).
 */
export async function getPublicJobById(jobId: string): Promise<DbAtsJob | null> {
  if (typeof jobId !== "string" || jobId.length === 0) return null;
  try {
    const job = await getJobById(jobId);
    if (!job || !isPubliclyListedJob(job)) return null;
    return job;
  } catch {
    return null;
  }
}

/** A `Json` column coerced to a string array. Never guesses a value. */
export function jobSkills(job: DbAtsJob): string[] {
  if (!Array.isArray(job.skills)) return [];
  return job.skills.filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** An ISO 8601 instant from a column, or `undefined`. Never "now". */
export function isoOrUndefined(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
