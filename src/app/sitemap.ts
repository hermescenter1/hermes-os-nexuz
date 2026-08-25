import type { MetadataRoute } from "next";
import { BASE_URL, LOCALES } from "@/lib/seo/config";
import { KNOWLEDGE } from "@/lib/industrial/knowledge";
import { CASES, CASE_CONTENT_LOCALES } from "@/lib/industrial/cases";
import { VENDORS } from "@/lib/industrial/vendors";

type SitemapEntry = MetadataRoute.Sitemap[number];

/**
 * DISCOVERY-2B — THIS SITEMAP IS GENERATED PER REQUEST, NOT AT BUILD TIME.
 *
 * THE DEFECT THIS FIXES
 * ---------------------
 * Without a route-level dynamic contract, Next.js treats a `sitemap.ts` with no
 * dynamic params as a STATICALLY PRERENDERED route: it executes the generator
 * once during `next build`, writes the result to
 * `.next/server/app/sitemap.xml.body`, and serves that frozen body for the life
 * of the image.
 *
 * `Dockerfile` builds the image under `ENV HERMES_STORAGE_MODE="session"` — a
 * deliberate contract, because an image build must never reach a production
 * database. `getPrisma()` returns `null` in session mode, so every DB-backed
 * branch below correctly contributed nothing... and Next.js then persisted that
 * empty result as the authoritative production sitemap.
 *
 * Measured on the production baseline: 241 URLs, of which ZERO were articles,
 * author profiles, media assets, Academy courses or job postings — while the
 * production database held 19 sitemap-eligible articles (8 EN + 11 FA). The
 * static artifact and the live response were byte-identical, which is what
 * proves the body was frozen rather than merely empty at that moment.
 *
 * WHY `force-dynamic` AND NOT SOMETHING ELSE
 * ------------------------------------------
 * It is the smallest supported mechanism that makes the contract EXPLICIT
 * rather than incidental. In Next 15.5.23 the metadata-route loader
 * (`next-metadata-route-loader`) re-exports every named export of this file
 * except `default` and `generateSitemaps`, so this segment config reaches the
 * generated route module; `next/dist/build/utils.js` then sets `revalidate = 0`
 * and keeps the route out of the prerender manifest. The alternative —
 * depending on some accidental dynamic signal — is exactly how this regressed
 * in the first place, and would regress again silently.
 *
 * A time-based `revalidate` was NOT used: it would still serve a build-frozen
 * body for the first window after every deploy, which is the same defect with a
 * shorter fuse. Sitemap traffic is a handful of crawler fetches per day and
 * every database read below is bounded by an explicit `take`, so per-request
 * generation is affordable.
 *
 * WHAT DID NOT CHANGE
 * -------------------
 * No predicate, no locale expansion, no storage-mode logic, and no
 * `getPrisma()` behaviour. The database branches were always correct; they were
 * simply being executed in the one environment guaranteed to have no database.
 * Their graceful degradation still applies — see the note on the `catch` blocks
 * below — so a runtime with no reachable database still serves valid XML
 * containing the complete static public surface.
 */
export const dynamic = "force-dynamic";

/**
 * Hard ceiling on Academy course rows one sitemap generation will read.
 *
 * Mirrors `MEDIA_SITEMAP_MAX_ASSETS`. Multiplied by the active locales this is
 * well inside the 50 000 URL / 50 MB sitemap limits, and it means this branch
 * cannot become an unbounded scan as the catalog grows. When a deployment
 * outgrows it the fix is a paginated sitemap index, not a larger number.
 */
const ACADEMY_SITEMAP_MAX_COURSES = 1000;

/* PHASE 105 — `lastModified` on static routes is deliberately OMITTED.
 *
 * Every entry previously carried the same hard-coded `2026-06-25`, which is a
 * fabricated modification date: it claims all ~25 marketing pages changed on
 * one day and then never again. The application has no genuine per-page edit
 * timestamp for statically authored routes, and `lastmod` is optional in the
 * sitemap protocol, so declaring nothing is the honest signal. Database-backed
 * families (articles, media) DO carry a real `lastModified` from their rows. */

/** Static public routes (path relative to locale, no trailing slash) */
const STATIC_PATHS = [
  { path: "",           priority: 1.0,  changeFreq: "weekly"  as const },
  { path: "/platform",  priority: 0.9,  changeFreq: "monthly" as const },
  { path: "/services",  priority: 0.9,  changeFreq: "monthly" as const },
  { path: "/services/industrial-ai",    priority: 0.85, changeFreq: "monthly" as const },
  { path: "/services/knowledge-cloud",  priority: 0.85, changeFreq: "monthly" as const },
  { path: "/services/cybersecurity",    priority: 0.85, changeFreq: "monthly" as const },
  { path: "/services/plc",              priority: 0.85, changeFreq: "monthly" as const },
  { path: "/services/scada-hmi",        priority: 0.85, changeFreq: "monthly" as const },
  { path: "/architecture", priority: 0.85, changeFreq: "monthly" as const },
  // R2 — eight already-implemented platform capabilities, newly given a
  // public explainer under /services/<slug>. See CapabilityDetail.tsx and
  // src/lib/capabilities/registry.ts for the underlying evidence.
  { path: "/services/digital-twin",             priority: 0.8, changeFreq: "monthly" as const },
  { path: "/services/predictive-maintenance",   priority: 0.8, changeFreq: "monthly" as const },
  { path: "/services/cmms",                     priority: 0.8, changeFreq: "monthly" as const },
  { path: "/services/multi-site",               priority: 0.8, changeFreq: "monthly" as const },
  { path: "/services/edms",                     priority: 0.8, changeFreq: "monthly" as const },
  { path: "/services/erp",                      priority: 0.8, changeFreq: "monthly" as const },
  { path: "/services/ot-edge",                  priority: 0.8, changeFreq: "monthly" as const },
  { path: "/services/crm",                      priority: 0.8, changeFreq: "monthly" as const },
  // TWO DISTINCT PUBLIC CAPABILITIES — NOT duplicates of each other.
  //
  //   /brain            → "Hermes Brain", the Industrial Knowledge Engine
  //   /industrial-brain → "Hermes Industrial Brain", alarm intelligence,
  //                       signal matrix and industrial fault analysis
  //
  // Both are deliberately public (see the Phase 82 note in the
  // /industrial-brain page), both are self-canonical, and neither canonicalises
  // or redirects to the other. `/industrial-brain` is in fact the entry point
  // linked from the homepage and the public nav, so omitting it would hide the
  // primary Industrial Brain surface from crawlers.
  { path: "/brain",            priority: 0.8,  changeFreq: "monthly" as const },
  { path: "/industrial-brain", priority: 0.8,  changeFreq: "monthly" as const },
  { path: "/copilot",       priority: 0.8,  changeFreq: "monthly" as const },
  { path: "/library",       priority: 0.9,  changeFreq: "weekly"  as const },
  { path: "/library/cases", priority: 0.8,  changeFreq: "weekly"  as const },
  // The Journal index. Previously absent from the sitemap entirely, together
  // with every article and author page beneath it — the single largest gap in
  // the site's crawlable technical-authority surface.
  { path: "/articles",      priority: 0.9,  changeFreq: "daily"   as const },
  { path: "/academy",       priority: 0.9,  changeFreq: "weekly"  as const },
  // DISCOVERY-2A — `/videos` is NOT listed.
  //
  // A media asset is addressed by `(organization, slug)`, so the bare hub root
  // has no organization and can never render a library. It was advertised here
  // at priority 0.8 while permanently serving an empty grid — a soft 404, and
  // advertising one teaches a crawler to discount the whole sitemap. The route
  // still answers 200 and is now `noindex`; the indexable media surfaces are
  // `/videos/{org}` and `/videos/{org}/{slug}`, appended below from the DB.
  // A real hub is DISCOVERY-2B's decision, not an indexing fix.
  { path: "/pricing",       priority: 0.8,  changeFreq: "monthly" as const },
  { path: "/careers",       priority: 0.9,  changeFreq: "daily"   as const },
  { path: "/vendors",       priority: 0.9,  changeFreq: "weekly"  as const },
  { path: "/vendors/apply", priority: 0.7,  changeFreq: "monthly" as const },
  { path: "/contact",       priority: 0.7,  changeFreq: "yearly"  as const },
  { path: "/about",         priority: 0.7,  changeFreq: "yearly"  as const },
  { path: "/privacy",       priority: 0.5,  changeFreq: "yearly"  as const },
  { path: "/terms",         priority: 0.5,  changeFreq: "yearly"  as const },
  { path: "/cookies",       priority: 0.5,  changeFreq: "yearly"  as const },
  // DISCOVERY-2A — `/privacy-center` is NOT listed. It is registered in
  // `PROTECTED_PATHS` (`@/lib/auth/rbac`), so an anonymous crawler following it
  // receives a 307 to `/auth/login`. Advertising an authenticated URL as public
  // content is the same defect class as leaking one: the sitemap must follow the
  // access authority, never the other way round. `sitemap-route-contract.test.ts`
  // now fails if any protected prefix reappears here.
  { path: "/gdpr",          priority: 0.5,  changeFreq: "yearly"  as const },
];

/**
 * One entry per locale in which the content GENUINELY exists.
 *
 * DISCOVERY-2A — `contentLocales` defaults to every active locale, which is
 * correct for a page whose copy comes from `messages/{fa,en,de}.json`: those are
 * translated with full key parity, so all three URLs really are alternates of
 * one another. Record-backed families pass their own list and get exactly those
 * URLs, with reciprocal `alternates` covering only the real set — matching the
 * `<link rel="alternate">` tags the page itself now emits through
 * `buildMetadata({ contentLocales })`. The sitemap and the page can no longer
 * disagree about which translations exist.
 */
function localeEntries(
  path: string,
  priority: number,
  changeFreq: SitemapEntry["changeFrequency"],
  contentLocales: readonly string[] = LOCALES,
): SitemapEntry[] {
  const locales = contentLocales.filter((l) => (LOCALES as readonly string[]).includes(l));
  if (locales.length === 0) return [];
  return locales.map((locale) => ({
    url: `${BASE_URL}/${locale}${path}`,
    changeFrequency: changeFreq,
    priority,
    // A single-representation document has no alternates; emitting a lone
    // self-referencing entry would claim a translation relationship with itself.
    ...(locales.length > 1
      ? {
          alternates: {
            languages: Object.fromEntries(
              locales.map((l) => [l, `${BASE_URL}/${l}${path}`]),
            ),
          },
        }
      : {}),
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: SitemapEntry[] = [];

  // Static routes × locales
  for (const { path, priority, changeFreq } of STATIC_PATHS) {
    entries.push(...localeEntries(path, priority, changeFreq));
  }

  // Dynamic: knowledge library articles × locales.
  // Every visible string lives in `messages.knowledge.<id>.*` with full fa/en/de
  // parity, so all three locales are real representations.
  for (const lib of KNOWLEDGE) {
    entries.push(...localeEntries(`/library/${lib.id}`, 0.75, "monthly"));
  }

  // DISCOVERY-2A — the engineering case corpus (14 records).
  //
  // These were absent from the sitemap entirely while ALSO inheriting the locale
  // homepage as their canonical, so the site's strongest technical-evidence
  // surface was both unlisted and de-indexed. Both halves are fixed: the page
  // now declares its own canonical, and the URLs are listed here.
  //
  // TWO locales, not three. `EngineeringCase` carries an `en` body and an `fa`
  // body and no German one (`CASE_CONTENT_LOCALES`), and the detail page reads
  // `locale === "fa" ? c.fa : c.en` — so `/de/library/cases/{id}` serves the
  // ENGLISH text under German chrome and is not a German representation. It
  // still renders and canonicalises to `/en`; it is simply not advertised.
  for (const c of CASES) {
    entries.push(
      ...localeEntries(`/library/cases/${c.id}`, 0.75, "monthly", CASE_CONTENT_LOCALES),
    );
  }

  // DISCOVERY-2A — the vendor knowledge pages (7 records).
  //
  // Also previously unlisted. Unlike the cases these ARE genuinely trilingual:
  // `library/vendor/[vendor]/page.tsx` renders entirely from the `library`,
  // `brain`, `knowledge` and `knowledgeCases` catalogs, all of which carry full
  // fa/en/de parity — so the default locale set is correct here.
  for (const v of VENDORS) {
    entries.push(...localeEntries(`/library/vendor/${v.id}`, 0.7, "monthly"));
  }

  // DISCOVERY-2A — job postings come from the AUTHORITATIVE source only.
  //
  // This branch used to import `@/lib/ats/mock-data` and advertise five invented
  // vacancies. It now reads `AtsJob` through `@/lib/ats/public-jobs`, which
  // applies the public predicate (OPEN + isPublic) and returns `[]` rather than
  // ever falling back to the fixture. When the database is unreachable the
  // family is simply omitted — the same graceful degradation every other
  // DB-backed branch below uses. A search engine cannot tell a fixture from a
  // fact, so public discovery fails empty.
  //
  // DISCOVERY-2B (query hardening) — this consumes `listPublicJobSitemapItems`,
  // NOT `listPublicJobs`. The latter delegates to `getPublicJobs()`, which is
  // shared with `GET /api/careers/jobs` and therefore has no `take` and no
  // `select`: it materialises every column, including `description` and four
  // `Json` columns, for rows this loop reduces to an `id`. Unbounded and
  // heavyweight was tolerable once per image build; it is not on a route that
  // now runs on every anonymous request. Eligibility is identical — the
  // sitemap reader pins the same OPEN + isPublic + not-deleted predicate.
  try {
    const { listPublicJobSitemapItems } = await import("@/lib/ats/public-jobs");
    for (const job of await listPublicJobSitemapItems()) {
      // B1.1 — ONLY the locales whose translation is complete. A blanket
      // three-locale expansion would advertise German/Persian pages that
      // answer noindex (or 404 content) for a job translated only in English.
      entries.push(...localeEntries(`/careers/${job.id}`, 0.8, "weekly", job.locales));
    }
  } catch {
    // DISCOVERY-2B: unreachable database — this family is omitted and the rest
    // of the sitemap still renders. Never a fixture fallback (see public-jobs.ts).
  }

  // PHASE 105 — the Journal (DB-backed, bounded, published + indexable only).
  //
  // The predicate lives in `@/lib/articles/seo` and is a SUPERSET of the one the
  // article page applies to itself: PUBLISHED + PUBLIC + `noIndex === false`.
  // The last clause is why this cannot reuse the public feed helper — an editor
  // de-indexing an article must remove it from the sitemap too, not leave the
  // sitemap advertising a URL that serves `noindex`. Author profiles are listed
  // only when they actually carry an indexable article, so the sitemap never
  // points at an empty profile page. `lastModified` is the row's real timestamp.
  try {
    const {
      listPublicArticleSitemapItems,
      listPublicAuthorSitemapItems,
      articleSitemapEntries,
      authorSitemapEntries,
    } = await import("@/lib/articles/seo");
    entries.push(...articleSitemapEntries(await listPublicArticleSitemapItems()));
    entries.push(...authorSitemapEntries(await listPublicAuthorSitemapItems()));
  } catch {
    // DISCOVERY-2B: unreachable database — the Journal is omitted and the rest of
    // the sitemap still renders. A partial sitemap beats a failed request.
  }

  // Dynamic: academy courses (DB-backed — skip gracefully if unavailable).
  //
  // DISCOVERY-2A added the two predicates this read was missing. It was a bare
  // `findMany({ select: { id: true } })`: no publication filter, so every DRAFT
  // course was advertised as public content, and no `take`, so it degraded into
  // an unbounded table scan on every sitemap generation. `isPublished` is an
  // existing column with an existing index (`@@index([organizationId,
  // isPublished])`), so this needs no schema change.
  //
  // hreflang is deliberately UNCHANGED here: `AcademyCourse` carries a plain
  // `title`/`description` and NO locale column, so there is no way to know which
  // language a course is written in. Fixing that needs either a schema addition
  // or an owner ruling on the default course language — deferred to
  // DISCOVERY-2B by owner decision, rather than guessed at here.
  try {
    const { getPrisma } = await import("@/lib/db/prisma");
    const prisma = await getPrisma();
    if (prisma) {
      const courses = await (prisma as unknown as {
        academyCourse: { findMany: (a: unknown) => Promise<{ id: string }[]> }
      }).academyCourse.findMany({
        where: { isPublished: true },
        select: { id: true },
        // DISCOVERY-2B (query hardening): deterministic order. A `take` with no
        // `orderBy` is a bounded but ARBITRARY slice, so two identical crawls
        // could be advertised two different course sets once the catalog
        // exceeds the ceiling.
        orderBy: { createdAt: "desc" },
        take: ACADEMY_SITEMAP_MAX_COURSES,
      });
      for (const course of courses) {
        entries.push(...localeEntries(`/academy/course/${course.id}`, 0.8, "weekly"));
      }
    }
  } catch {
    // DISCOVERY-2B: unreachable database — courses omitted, rest still renders.
  }

  // Dynamic: approved vendor profiles (DB-backed — skip gracefully if unavailable)
  try {
    const { listApprovedVendorSlugs } = await import("@/lib/vendors/db");
    const slugs = await listApprovedVendorSlugs();
    for (const slug of slugs ?? []) {
      entries.push(...localeEntries(`/vendors/${slug}`, 0.8, "weekly"));
    }
  } catch {
    // DISCOVERY-2B: unreachable database — vendor profiles omitted, rest renders.
  }

  // PHASE 102 — public media hub (DB-backed, bounded, published-only).
  //
  // The predicate lives in `@/lib/media/seo`, which reuses the media repository's
  // own `mediaVisibilityWhere(PUBLIC_AUDIENCE)` fragment: a DRAFT, SUBMITTED,
  // REJECTED, ARCHIVED, PRIVATE, ORGANIZATION-visibility, still-validating,
  // quarantined or editor-`noIndex`ed asset can never reach this list. The read is
  // capped at MEDIA_SITEMAP_MAX_ASSETS rows, so — unlike the academy branch above —
  // it cannot become an unbounded scan as the library grows. `lastModified` is the
  // immutable first-publication instant, never `updatedAt` (which the view counter
  // moves on every single play).
  try {
    const { listPublicMediaSitemapItems, mediaSitemapEntries } = await import("@/lib/media/seo");
    entries.push(...mediaSitemapEntries(await listPublicMediaSitemapItems()));
  } catch {
    // DISCOVERY-2B: unreachable database — media omitted, rest still renders.
  }

  return entries;
}
