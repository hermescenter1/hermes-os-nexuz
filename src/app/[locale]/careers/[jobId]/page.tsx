import { setRequestLocale, getTranslations } from "next-intl/server";
import { JobDetailClient }    from "@/components/careers/JobDetailClient";
import { JsonLd }             from "@/components/seo/JsonLd";
import { jobPostingSchema }   from "@/lib/seo/schemas";
import { buildMetadata, noIndexMetadata } from "@/lib/seo/metadata";
import { getPublicJobPosting } from "@/lib/ats/public-jobs";
import { BASE_URL }           from "@/lib/seo/config";

/**
 * DISCOVERY-2A — the public job detail page.
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * HISTORICAL (pre-B1): this file imported `{ JOBS } from "@/lib/ats/mock-data"` and handed five
 * invented vacancies — with invented salary bands, cities, sponsorship and
 * posting dates — straight into `JobPosting` structured data, the exact format
 * Google Jobs ingests. It read the fixture directly and never consulted the
 * database, even though `AtsJob` and `getPublicJobs()` exist and carry the
 * correct public predicate.
 *
 * The authority is `@/lib/ats/public-jobs`, and since B1 there is no fixture
 * anywhere in this path:
 *
 *   - an ELIGIBLE posting (OPEN, public, published, unexpired) whose requested
 *     locale has a COMPLETE translation → indexable, with `JobPosting`
 *     structured data whose every property comes from a column or that
 *     translation, `datePosted` from `publishedAt` and `validThrough` from
 *     `AtsJob.closingDate`;
 *   - anything else (unknown id, DRAFT/CLOSED, non-public, unpublished,
 *     expired, or a locale without a complete translation) → `noindex`, NO
 *     canonical and NO `JobPosting`. `JobDetailClient` fetches
 *     `/api/careers/jobs/{id}?locale=…`, which is DB-only: it answers 404 for
 *     an ineligible posting and 503 for an unreachable store, so the page
 *     renders an honest unavailable or outage state rather than invented copy.
 *
 * The search index therefore only ever learns about vacancies the database can
 * prove, in the locales that really have a page. `/careers` itself remains a
 * normal public company page.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const { locale, jobId } = await params;
  // 89C: localized title template, keywords suffix and not-found title.
  const tMeta = await getTranslations({ locale, namespace: "meta" });
  const p = tMeta.raw("pages") as Record<string, Record<string, string>>;

  // B1.1 — metadata, the rendered UI and the JobPosting JSON-LD all read the
  // SAME projection: the requested locale's COMPLETE translation of an
  // eligible, published row. No legacy English column is consulted, so a DE
  // page cannot carry an English <title>. A locale without a complete
  // translation gets noindex, NO canonical and no JobPosting.
  const posting = await getPublicJobPosting(jobId, locale);
  if (!posting) {
    return noIndexMetadata(p.careersJob.notFoundTitle);
  }

  return buildMetadata({
    locale,
    path:        `/careers/${jobId}`,
    title:       posting.seoTitle,
    description: posting.seoDescription,
    keywords:    [...posting.localizedSkillLabels, p.careersJob.keywordsSuffix].join(", "),
    // B1.2 — hreflang/canonical/OG alternates claim ONLY the locales whose
    // translation is really complete (the same truth record the sitemap and
    // the UI derive from). An EN-only job advertises no DE/FA alternates and
    // no multi-member x-default.
    contentLocales: posting.availableLocales,
  });
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const { locale, jobId } = await params;
  setRequestLocale(locale);
  const bcT = await getTranslations({ locale, namespace: "meta" });
  const bc = bcT.raw("breadcrumbs") as Record<string, string>;
  const pJob = bcT.raw("pages") as Record<string, Record<string, string>>;

  // PHASE 104-B1 — JobPosting is built ONLY from the posting projection:
  // an eligible row, published (datePosted := publishedAt, never createdAt),
  // a COMPLETE translation for THIS locale, the stable org-scoped
  // requisitionKey and all three structured address fields. Anything short of
  // that emits no JobPosting at all — a property the record cannot back is
  // omitted, never defaulted.
  const posting = await getPublicJobPosting(jobId, locale);

  return (
    <>
      {posting && (
        <JsonLd
          data={jobPostingSchema({
            requisitionKey:  posting.requisitionKey,
            title:           posting.title,
            description:     posting.description,
            addressLocality: posting.addressLocality,
            addressRegion:   posting.addressRegion,
            addressCountry:  posting.addressCountry,
            currency:        posting.currency,
            salaryMin:       posting.salaryMin,
            salaryMax:       posting.salaryMax,
            employmentType:  posting.employmentType,
            datePosted:      posting.datePosted,
            validThrough:    posting.validThrough,
            skills:          posting.skills,
          })}
        />
      )}
      {/* The breadcrumb describes the URL the visitor is on and asserts nothing
          about employment, so it is emitted even when no posting is verified. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: bc.home,    item: `${BASE_URL}/${locale}` },
            { "@type": "ListItem", position: 2, name: bc.careers, item: `${BASE_URL}/${locale}/careers` },
            { "@type": "ListItem", position: 3, name: posting?.title ?? pJob.careersJob.notFoundTitle, item: `${BASE_URL}/${locale}/careers/${jobId}` },
          ],
        }}
      />
      <JobDetailClient jobId={jobId} />
    </>
  );
}
