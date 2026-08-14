import type { MetadataRoute } from "next";
import { BASE_URL, LOCALES } from "@/lib/seo/config";
import { KNOWLEDGE } from "@/lib/industrial/knowledge";
import { JOBS } from "@/lib/ats/mock-data";

type SitemapEntry = MetadataRoute.Sitemap[number];

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
  // Public media hub index. Individual assets are appended below from the DB.
  { path: "/videos",        priority: 0.8,  changeFreq: "weekly"  as const },
  { path: "/pricing",       priority: 0.8,  changeFreq: "monthly" as const },
  { path: "/careers",       priority: 0.9,  changeFreq: "daily"   as const },
  { path: "/vendors",       priority: 0.9,  changeFreq: "weekly"  as const },
  { path: "/vendors/apply", priority: 0.7,  changeFreq: "monthly" as const },
  { path: "/contact",       priority: 0.7,  changeFreq: "yearly"  as const },
  { path: "/about",         priority: 0.7,  changeFreq: "yearly"  as const },
  { path: "/privacy",       priority: 0.5,  changeFreq: "yearly"  as const },
  { path: "/terms",         priority: 0.5,  changeFreq: "yearly"  as const },
  { path: "/cookies",       priority: 0.5,  changeFreq: "yearly"  as const },
  { path: "/privacy-center",priority: 0.5,  changeFreq: "monthly" as const },
  { path: "/gdpr",          priority: 0.5,  changeFreq: "yearly"  as const },
];

function localeEntries(path: string, priority: number, changeFreq: SitemapEntry["changeFrequency"]): SitemapEntry[] {
  return LOCALES.map((locale) => ({
    url: `${BASE_URL}/${locale}${path}`,
    changeFrequency: changeFreq,
    priority,
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map((l) => [l, `${BASE_URL}/${l}${path}`])
      ),
    },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: SitemapEntry[] = [];

  // Static routes × locales
  for (const { path, priority, changeFreq } of STATIC_PATHS) {
    entries.push(...localeEntries(path, priority, changeFreq));
  }

  // Dynamic: knowledge library articles × locales
  for (const lib of KNOWLEDGE) {
    entries.push(...localeEntries(`/library/${lib.id}`, 0.75, "monthly"));
  }

  // Dynamic: open job postings × locales
  const openJobs = JOBS.filter((j) => j.status === "open");
  for (const job of openJobs) {
    entries.push(...localeEntries(`/careers/${job.id}`, 0.8, "weekly"));
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
    // DB not available at build time — Journal omitted from the static sitemap
  }

  // Dynamic: academy courses (DB-backed — skip gracefully if unavailable)
  try {
    const { getPrisma } = await import("@/lib/db/prisma");
    const prisma = await getPrisma();
    if (prisma) {
      const courses = await (prisma as unknown as {
        academyCourse: { findMany: (a: unknown) => Promise<{ id: string }[]> }
      }).academyCourse.findMany({ select: { id: true } });
      for (const course of courses) {
        entries.push(...localeEntries(`/academy/course/${course.id}`, 0.8, "weekly"));
      }
    }
  } catch {
    // DB not available at build time — courses omitted from static sitemap
  }

  // Dynamic: approved vendor profiles (DB-backed — skip gracefully if unavailable)
  try {
    const { listApprovedVendorSlugs } = await import("@/lib/vendors/db");
    const slugs = await listApprovedVendorSlugs();
    for (const slug of slugs ?? []) {
      entries.push(...localeEntries(`/vendors/${slug}`, 0.8, "weekly"));
    }
  } catch {
    // DB not available at build time — vendor profiles omitted from static sitemap
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
    // DB not available at build time — media assets omitted from static sitemap
  }

  return entries;
}
