import type { MetadataRoute } from "next";
import { BASE_URL, LOCALES } from "@/lib/seo/config";
import { KNOWLEDGE } from "@/lib/industrial/knowledge";
import { JOBS } from "@/lib/ats/mock-data";

type SitemapEntry = MetadataRoute.Sitemap[number];

const NOW = new Date("2026-06-25").toISOString();

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
  { path: "/brain",         priority: 0.8,  changeFreq: "monthly" as const },
  { path: "/copilot",       priority: 0.8,  changeFreq: "monthly" as const },
  { path: "/library",       priority: 0.9,  changeFreq: "weekly"  as const },
  { path: "/library/cases", priority: 0.8,  changeFreq: "weekly"  as const },
  { path: "/academy",       priority: 0.9,  changeFreq: "weekly"  as const },
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
    lastModified: NOW,
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

  return entries;
}
