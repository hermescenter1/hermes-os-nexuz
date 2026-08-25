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
 * HISTORICAL (pre-B1): the API routes under `/api/careers` read the database
 * first and fell back to the fixture, tagging the response `source: "mock"`.
 * The defect was never a missing authority — `AtsJob` and `getPublicJobs()`
 * exist and carry the correct predicate — it was that the surfaces search
 * engines read never consulted it.
 *
 * CURRENT (since B1): there is NO fixture path anywhere in `/api/careers`.
 * Both public routes are DB-only and answer 503 when the store is
 * unreachable; `source: "mock"` is never emitted. The clients still require
 * `source === "db"` as defense in depth, not as a fallback contract.
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
 * HISTORICAL (pre-B1): rendering was a separate concern — `/careers` and
 * `/careers/{id}` kept working in development against the fixture, and a
 * fixture-backed page was `noindex` with no `JobPosting`.
 *
 * CURRENT (since B1): no fixture reaches any public surface at all. Without a
 * database the pages render their honest unavailable/outage states, and a
 * posting is served only where the requested locale's translation is
 * complete.
 */

import { getPrisma } from "@/lib/db/prisma";
import { getPublicJobs, getJobById, type DbAtsJob } from "./db";
import {
  publicJobWhere,
  isJobPubliclyEligible,
  isTranslationComplete,
  completeLocalesOf,
  localeToJobLanguage,
  type AtsPublicLocale,
  type JobTranslationRow,
} from "./eligibility";

export { publicJobWhere, isJobPubliclyEligible, isTranslationComplete, completeLocalesOf, localeToJobLanguage };

/**
 * The public predicate, restated once so every caller applies the same one.
 * PHASE 104-B1 widened the CONTRACT (not the audience): OPEN + isPublic alone
 * no longer suffice — the row must also carry a real, non-future publishedAt
 * and an unexpired closingDate. Delegates to `eligibility.ts`, the single
 * source shared with the apply route and the JobPosting builder.
 */
export function isPubliclyListedJob(
  job: DbAtsJob & { publishedAt?: Date | null; deletedAt?: Date | null },
  now: Date = new Date(),
): boolean {
  return isJobPubliclyEligible(job, now);
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
 * them, and so it cannot drift from `isPubliclyListedJob` above (B1: both now
 * come from `eligibility.ts`). It is the same
 * contract `getPublicJobs()` pins in its own query and the public detail route
 * re-checks: OPEN, explicitly public, not soft-deleted.
 */
export function jobSitemapWhere(now: Date = new Date()) {
  return publicJobWhere(now);
}

/** One publicly listed job: its id and the locales whose translation is
 *  COMPLETE. The sitemap emits ONLY those locale URLs — a job with a complete
 *  EN and a half-finished DE must not advertise a German page. */
export interface JobSitemapItem {
  readonly id: string;
  readonly locales: readonly string[];
}

/*
 * B1.2 — the DB-side COMPLETE_TRANSLATION_WHERE is GONE. It refused "" but
 * accepted "   ", so the sitemap and the page could disagree about the same
 * row. Completeness is now decided in exactly ONE place —
 * `completeLocalesOf` / `isTranslationComplete` (trim-based) — and the
 * sitemap reader loads the six completeness fields (bounded: take ≤ 1000
 * eligible jobs, six short-to-medium text columns per translation) and runs
 * that same primitive in memory. No parallel predicate exists to drift.
 */

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
 * ELIGIBILITY comes from `jobSitemapWhere()` — since B1 that is the full
 * OPEN + isPublic + not-deleted + published + unexpired contract; this reader
 * narrows the PROJECTION and bounds the ROW COUNT, never what counts as
 * public.
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
      where: jobSitemapWhere(),
      // B1.2 — the six completeness fields + the language tag, and nothing
      // else: completeness for the sitemap is decided by the SAME in-memory
      // primitive the page and the metadata use (completeLocalesOf), so the
      // three surfaces cannot disagree — including on whitespace-only values.
      // Still bounded (take below) and still no Json payload column.
      select: {
        id: true,
        translations: {
          select: {
            language: true,
            title: true,
            shortSummary: true,
            description: true,
            departmentLabel: true,
            seoTitle: true,
            seoDescription: true,
          },
        },
      },
      // Deterministic, and newest-first so a truncated list keeps the freshest
      // postings rather than an arbitrary slice.
      orderBy: { createdAt: "desc" },
      take,
    });

    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: typeof row.id === "string" ? row.id : "",
        locales: completeLocalesOf(
          Array.isArray(row.translations)
            ? (row.translations as (JobTranslationRow & { language: string })[])
            : [],
        ),
      }))
      .filter((item) => item.id.length > 0 && item.locales.length > 0);
  } catch {
    return [];
  }
}

/**
 * Every job the public site may advertise, or `[]` when the database is not
 * reachable. Never throws; no fixture path exists to fall back to.
 */
export async function listPublicJobs(): Promise<DbAtsJob[]> {
  try {
    const rows = await getPublicJobs();
    if (rows === null) return [];
    // `getPublicJobs` already pins `status`/`isPublic` in the query; re-applying
    // the predicate here means a future change to that query cannot silently
    // widen what the sitemap advertises.
    return rows.filter((j) => isPubliclyListedJob(j));
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

/* ── PHASE 104-B1 — the locale-aware DB-only public projection ────────────────
   The careers API routes read THIS, never the fixture and never a raw model.
   A job appears only when it passes the shared eligibility AND carries a
   complete translation for the requested locale. `null` means the store is
   unreachable — the route answers 503, never an invented empty state. */

export interface PublicJobCard {
  id: string;
  title: string;
  shortSummary: string;
  department: string;
  departmentLabel: string;
  location: string;
  addressLocality: string | null;
  addressRegion: string | null;
  addressCountry: string | null;
  locationType: string | null;
  skills: string[];
  publishedAt: string;
  closingDate: string | undefined;
}

type PublicRow = DbAtsJob & {
  publishedAt: Date | null;
  deletedAt: Date | null;
  addressLocality: string | null;
  addressRegion: string | null;
  addressCountry: string | null;
  translations?: JobTranslationRow[];
};

const PUBLIC_LIST_MAX = 200;

export async function listPublicJobCards(
  locale: string,
  opts?: { department?: string },
): Promise<PublicJobCard[] | null> {
  try {
    const prisma = await getPrisma();
    if (!prisma) return null;
    const model = (prisma as unknown as { atsJob?: { findMany?: (a: unknown) => Promise<PublicRow[]> } }).atsJob;
    if (!model?.findMany) return null;
    const now = new Date();
    const language = localeToJobLanguage(locale);
    const rows = await model.findMany({
      where: {
        ...publicJobWhere(now),
        ...(opts?.department ? { department: opts.department } : {}),
      },
      include: { translations: { where: { language } } },
      orderBy: { publishedAt: "desc" },
      take: PUBLIC_LIST_MAX,
    });
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => isJobPubliclyEligible(row, now))
      .map((row) => toCard(row, row.translations?.[0]))
      .filter((c): c is PublicJobCard => c !== null);
  } catch {
    return null;
  }
}

export async function getPublicJobCard(jobId: string, locale: string): Promise<PublicJobCard | null | "UNAVAILABLE"> {
  if (typeof jobId !== "string" || jobId.length === 0) return null;
  try {
    const prisma = await getPrisma();
    if (!prisma) return "UNAVAILABLE";
    const model = (prisma as unknown as { atsJob?: { findFirst?: (a: unknown) => Promise<PublicRow | null> } }).atsJob;
    if (!model?.findFirst) return "UNAVAILABLE";
    const now = new Date();
    const language = localeToJobLanguage(locale);
    const row = await model.findFirst({
      where: { id: jobId, ...publicJobWhere(now) },
      include: { translations: { where: { language } } },
    });
    if (!row || !isJobPubliclyEligible(row, now)) return null;
    return toCard(row, row.translations?.[0]);
  } catch {
    return "UNAVAILABLE";
  }
}

function toCard(row: PublicRow, translation: JobTranslationRow | undefined): PublicJobCard | null {
  // A locale without a COMPLETE translation is not served that locale's page.
  if (!isTranslationComplete(translation)) return null;
  const publishedAt = isoOrUndefined(row.publishedAt);
  if (!publishedAt) return null;
  return {
    id: row.id,
    title: translation!.title,
    shortSummary: translation!.shortSummary,
    department: row.department,
    departmentLabel: translation!.departmentLabel,
    location: row.location,
    addressLocality: row.addressLocality ?? null,
    addressRegion: row.addressRegion ?? null,
    addressCountry: row.addressCountry ?? null,
    locationType: row.locationType ?? null,
    skills: jobSkills(row),
    publishedAt,
    closingDate: isoOrUndefined(row.closingDate),
  };
}


/* ── PHASE 104-B1.1 — the public DETAIL projection ────────────────────────────
   What a candidate reads on /careers/{id}. EVERY body field comes from the
   AtsJobTranslation row of the REQUESTED locale — title, summary, description,
   department label, responsibilities, requirements, preferred experience and
   skill labels. The legacy English AtsJob columns are never consulted for
   content, so DE/FA can never silently fall back to English.

   `benefits` is deliberately NOT part of this contract: AtsJobTranslation
   carries no benefits field, and serving the legacy English `AtsJob.benefits`
   on a DE/FA page is exactly the fallback this projection forbids. When the
   owner wants benefits on the public page, the path is a translated column on
   AtsJobTranslation via a new migration — not a fallback. */

export interface PublicJobDetail {
  id: string;
  title: string;
  shortSummary: string;
  description: string;
  departmentLabel: string;
  responsibilities: string[];
  requirements: string[];
  preferredExperience: string[];
  /** stable code → label in THIS locale; unlabeled codes stay codes (technical
   *  tokens, not prose), never English prose */
  localizedSkills: Record<string, string>;
  skillCodes: string[];
  location: string;
  locationType: string | null;
  salaryCurrency: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  publishedAt: string;
  closingDate: string | undefined;
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

function stringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" && val.length > 0) out[k] = val;
  }
  return out;
}

type DetailRow = PublicRow & {
  translations?: (JobTranslationRow & {
    responsibilities?: unknown;
    requirements?: unknown;
    preferredExperience?: unknown;
    localizedSkills?: unknown;
  })[];
};

export async function getPublicJobDetail(jobId: string, locale: string): Promise<PublicJobDetail | null | "UNAVAILABLE"> {
  if (typeof jobId !== "string" || jobId.length === 0) return null;
  try {
    const prisma = await getPrisma();
    if (!prisma) return "UNAVAILABLE";
    const model = (prisma as unknown as { atsJob?: { findFirst?: (a: unknown) => Promise<DetailRow | null> } }).atsJob;
    if (!model?.findFirst) return "UNAVAILABLE";
    const now = new Date();
    const language = localeToJobLanguage(locale);
    const row = await model.findFirst({
      where: { id: jobId, ...publicJobWhere(now) },
      include: { translations: { where: { language } } },
    });
    if (!row || !isJobPubliclyEligible(row, now)) return null;
    const t = row.translations?.[0];
    if (!isTranslationComplete(t)) return null;
    const publishedAt = isoOrUndefined(row.publishedAt);
    if (!publishedAt) return null;
    return {
      id: row.id,
      title: t!.title,
      shortSummary: t!.shortSummary,
      description: t!.description,
      departmentLabel: t!.departmentLabel,
      responsibilities: stringList(t!.responsibilities),
      requirements: stringList(t!.requirements),
      preferredExperience: stringList(t!.preferredExperience),
      localizedSkills: stringMap(t!.localizedSkills),
      skillCodes: jobSkills(row),
      location: row.location,
      locationType: row.locationType ?? null,
      salaryCurrency: row.salaryCurrency ?? null,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      publishedAt,
      closingDate: isoOrUndefined(row.closingDate),
    };
  } catch {
    return "UNAVAILABLE";
  }
}

/* ── PHASE 104-B1 — the JobPosting structured-data projection ─────────────────
   Structured data may be built ONLY from an eligible, published row whose
   requested-locale translation is complete AND that carries the stable
   requisitionKey, a real publishedAt and all three structured address fields.
   Anything less returns null and the page emits NO JobPosting. */

export interface PublicJobPosting {
  /** B1.2 — the ordered set of locales whose translation is COMPLETE; the ONE
   *  record of truth behind canonical, hreflang, OG alternates and the
   *  sitemap for this job. */
  availableLocales: AtsPublicLocale[];
  requisitionKey: string;
  title: string;
  description: string;
  /** B1.1 — metadata reads THESE, so page <title>/<meta>, UI and JSON-LD share
   *  one translation row and cannot disagree. */
  seoTitle: string;
  seoDescription: string;
  localizedSkillLabels: string[];
  addressLocality: string;
  addressRegion: string;
  addressCountry: string;
  currency: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: string | null;
  datePosted: string;
  validThrough: string | undefined;
  skills: string[];
}

type PostingRow = PublicRow & {
  requisitionKey: string | null;
  employmentType: string | null;
};

export async function getPublicJobPosting(jobId: string, locale: string): Promise<PublicJobPosting | null> {
  if (typeof jobId !== "string" || jobId.length === 0) return null;
  try {
    const prisma = await getPrisma();
    if (!prisma) return null;
    const model = (prisma as unknown as { atsJob?: { findFirst?: (a: unknown) => Promise<PostingRow | null> } }).atsJob;
    if (!model?.findFirst) return null;
    const now = new Date();
    const language = localeToJobLanguage(locale);
    const row = await model.findFirst({
      where: { id: jobId, ...publicJobWhere(now) },
      // ALL translation rows: the requested locale renders, the full set
      // yields availableLocales (the shared truth for hreflang/sitemap).
      include: { translations: true },
    });
    if (!row || !isJobPubliclyEligible(row, now)) return null;
    const all = (row.translations ?? []) as (JobTranslationRow & { language: string })[];
    const availableLocales = completeLocalesOf(all);
    const t = all.find((tr) => tr.language === language);
    if (!isTranslationComplete(t)) return null;
    const datePosted = isoOrUndefined(row.publishedAt);
    if (!datePosted) return null;
    if (!row.requisitionKey || !row.addressLocality || !row.addressRegion || !row.addressCountry) return null;
    const salaryComplete =
      typeof row.salaryCurrency === "string" && row.salaryCurrency.length > 0 &&
      typeof row.salaryMin === "number" && typeof row.salaryMax === "number";
    const localizedSkills =
      t && typeof (t as { localizedSkills?: unknown }).localizedSkills === "object" && (t as { localizedSkills?: unknown }).localizedSkills !== null
        ? Object.values((t as unknown as { localizedSkills: Record<string, unknown> }).localizedSkills).filter((v): v is string => typeof v === "string" && v.length > 0)
        : [];
    return {
      availableLocales,
      requisitionKey: row.requisitionKey,
      title: t!.title,
      description: t!.description,
      seoTitle: t!.seoTitle,
      seoDescription: t!.seoDescription,
      localizedSkillLabels: localizedSkills,
      addressLocality: row.addressLocality,
      addressRegion: row.addressRegion,
      addressCountry: row.addressCountry,
      currency: salaryComplete ? row.salaryCurrency : null,
      salaryMin: salaryComplete ? row.salaryMin : null,
      salaryMax: salaryComplete ? row.salaryMax : null,
      employmentType: row.employmentType ?? null,
      datePosted,
      validThrough: isoOrUndefined(row.closingDate),
      skills: jobSkills(row),
    };
  } catch {
    return null;
  }
}
