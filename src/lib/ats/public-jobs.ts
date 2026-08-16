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

import { getPrisma } from "@/lib/db/prisma";
import { getPublicJobs, getJobById, type DbAtsJob } from "./db";

/** The public predicate, restated once so every caller applies the same one. */
export function isPubliclyListedJob(job: DbAtsJob): boolean {
  return job.status === "OPEN" && job.isPublic === true;
}

/**
 * Hard ceiling on job rows one sitemap generation will read.
 *
 * Mirrors `ARTICLE_SITEMAP_MAX`, `MEDIA_SITEMAP_MAX_ASSETS` and
 * `ACADEMY_SITEMAP_MAX_COURSES`. When a deployment outgrows it the fix is a
 * paginated sitemap index, not a larger number.
 */
export const JOB_SITEMAP_MAX_POSTINGS = 1000;

/**
 * The eligibility predicate for a publicly listed job, as a Prisma `where`.
 *
 * Exported so a test can assert the exact clauses rather than re-describing
 * them, and so it cannot drift from `isPubliclyListedJob` above. It is the same
 * contract `getPublicJobs()` pins in its own query and the public detail route
 * re-checks: OPEN, explicitly public, not soft-deleted.
 */
export const JOB_SITEMAP_WHERE = {
  status: "OPEN",
  isPublic: true,
  deletedAt: null,
} as const;

/** One publicly listed job, reduced to what a sitemap URL actually needs. */
export interface JobSitemapItem {
  readonly id: string;
}

type FindMany = (args: unknown) => Promise<Record<string, unknown>[]>;

/**
 * DISCOVERY-2B (query hardening) — the sitemap's OWN job reader.
 *
 * WHY THIS EXISTS INSTEAD OF REUSING `getPublicJobs()`
 * ----------------------------------------------------
 * `getPublicJobs()` is correct, and it is shared with `GET /api/careers/jobs`,
 * so it is deliberately left alone. But it is unsuitable for a route that now
 * executes on EVERY anonymous request:
 *
 *   - it has no `take`, so the row count is unbounded;
 *   - it has no `select`, so every column is materialised — including
 *     `description` and the four `Json` columns `requirements`,
 *     `responsibilities`, `benefits` and `skills`.
 *
 * The sitemap consumes exactly one field per row: `id`, to build
 * `/{locale}/careers/{id}`. Loading heavy payloads to discard them was
 * tolerable when this ran once per image build; it is not once it is reachable
 * anonymously at will.
 *
 * ELIGIBILITY IS UNCHANGED. `JOB_SITEMAP_WHERE` is the same OPEN + isPublic +
 * not-deleted contract; this narrows the PROJECTION and bounds the ROW COUNT,
 * never what counts as public. A job this returns is a job `getPublicJobs()`
 * would also return.
 *
 * Returns `[]` — never throws — when the database is unavailable, matching the
 * fail-closed convention of every other sitemap family.
 */
export async function listPublicJobSitemapItems(
  limit: number = JOB_SITEMAP_MAX_POSTINGS,
): Promise<JobSitemapItem[]> {
  const take = Number.isInteger(limit)
    ? Math.min(Math.max(limit, 1), JOB_SITEMAP_MAX_POSTINGS)
    : JOB_SITEMAP_MAX_POSTINGS;

  try {
    const prisma = await getPrisma();
    if (!prisma) return [];
    const model = (prisma as unknown as { atsJob?: { findMany?: FindMany } }).atsJob;
    if (!model || typeof model.findMany !== "function") return [];

    const rows = await model.findMany({
      where: JOB_SITEMAP_WHERE,
      // An address and nothing else. No description, no Json payload column.
      select: { id: true },
      // Deterministic, and newest-first so a truncated list keeps the freshest
      // postings rather than an arbitrary slice.
      orderBy: { createdAt: "desc" },
      take,
    });

    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({ id: typeof row.id === "string" ? row.id : "" }))
      .filter((item) => item.id.length > 0);
  } catch {
    return [];
  }
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
