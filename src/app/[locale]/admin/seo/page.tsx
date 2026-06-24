import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }          from "@/components/PageShell";
import { RequireCapability }  from "@/components/auth/RequireCapability";
import { SeoAdminClient }     from "@/components/admin/SeoAdminClient";
import { noIndexMetadata }    from "@/lib/seo/metadata";
import { KNOWLEDGE }          from "@/lib/industrial/knowledge";
import { JOBS }               from "@/lib/ats/mock-data";
import { BASE_URL }           from "@/lib/seo/config";

export function generateMetadata() {
  return noIndexMetadata("SEO Dashboard · Hermes OS");
}

const STATIC_PUBLIC_ROUTES = [
  "/fa", "/en",
  "/fa/platform", "/en/platform",
  "/fa/services", "/en/services",
  "/fa/services/industrial-ai", "/en/services/industrial-ai",
  "/fa/services/knowledge-cloud", "/en/services/knowledge-cloud",
  "/fa/services/cybersecurity", "/en/services/cybersecurity",
  "/fa/services/plc", "/en/services/plc",
  "/fa/services/scada-hmi", "/en/services/scada-hmi",
  "/fa/architecture", "/en/architecture",
  "/fa/brain", "/en/brain",
  "/fa/copilot", "/en/copilot",
  "/fa/library", "/en/library",
  "/fa/library/cases", "/en/library/cases",
  "/fa/academy", "/en/academy",
  "/fa/careers", "/en/careers",
  "/fa/contact", "/en/contact",
  "/fa/about", "/en/about",
  "/fa/privacy", "/en/privacy",
  "/fa/terms", "/en/terms",
  "/fa/cookies", "/en/cookies",
  "/fa/privacy-center", "/en/privacy-center",
  "/fa/gdpr", "/en/gdpr",
];

const SCHEMA_TYPES_ACTIVE = [
  "Organization",
  "WebSite + SearchAction",
  "TechArticle (Knowledge Library)",
  "JobPosting (Careers)",
  "Course (Academy)",
  "BreadcrumbList",
];

export default async function SeoAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  const seo = p.seo;

  const openJobs       = JOBS.filter((j) => j.status === "open");
  const articleCount   = KNOWLEDGE.length;
  const staticCount    = STATIC_PUBLIC_ROUTES.length;
  const dynamicArticles = articleCount * 2; // × 2 locales
  const dynamicJobs     = openJobs.length * 2;
  const totalRoutes     = staticCount + dynamicArticles + dynamicJobs;

  const stats = {
    totalRoutes,
    staticRoutes:     staticCount,
    articleRoutes:    dynamicArticles,
    jobRoutes:        dynamicJobs,
    locales:          2,
    schemaTypes:      SCHEMA_TYPES_ACTIVE,
    knowledgeArticles: articleCount,
    openJobs:         openJobs.length,
    sitemapUrl:       `${BASE_URL}/sitemap.xml`,
    robotsUrl:        `${BASE_URL}/robots.txt`,
    manifestUrl:      `${BASE_URL}/manifest.webmanifest`,
    baseUrl:          BASE_URL,
    hreflangEnabled:  true,
    ogEnabled:        true,
    twitterEnabled:   true,
    canonicalEnabled: true,
  };

  return (
    <RequireCapability capability="admin">
      <PageShell>
        <div className="mx-auto max-w-screen-xl px-6 sm:px-8 pb-20">
          <div className="page-header-premium mb-8">
            <p className="eyebrow-label mb-2">{seo.eyebrow}</p>
            <h1 className="type-page-title">{seo.title}</h1>
            <p className="mt-2 type-secondary max-w-3xl">{seo.lede}</p>
          </div>
          <SeoAdminClient stats={stats} labels={seo} />
        </div>
      </PageShell>
    </RequireCapability>
  );
}
