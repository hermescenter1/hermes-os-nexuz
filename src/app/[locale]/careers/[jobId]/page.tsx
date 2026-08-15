import { setRequestLocale, getTranslations } from "next-intl/server";
import { JobDetailClient }    from "@/components/careers/JobDetailClient";
import { JsonLd }             from "@/components/seo/JsonLd";
import { jobPostingSchema }   from "@/lib/seo/schemas";
import { buildMetadata, noIndexMetadata } from "@/lib/seo/metadata";
import { getPublicJobById, isoOrUndefined, jobSkills } from "@/lib/ats/public-jobs";
import { BASE_URL }           from "@/lib/seo/config";

/**
 * DISCOVERY-2A — the public job detail page.
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * This file used to `import { JOBS } from "@/lib/ats/mock-data"` and hand five
 * invented vacancies — with invented salary bands, cities, sponsorship and
 * posting dates — straight into `JobPosting` structured data, the exact format
 * Google Jobs ingests. It read the fixture directly and never consulted the
 * database, even though `AtsJob` and `getPublicJobs()` exist and carry the
 * correct public predicate.
 *
 * The authority is now `@/lib/ats/public-jobs`, which never touches the fixture:
 *
 *   - a real, public, OPEN `AtsJob` → indexable, with `JobPosting` structured
 *     data whose every property comes from a column, and `validThrough` from
 *     `AtsJob.closingDate`;
 *   - anything else (unknown id, DRAFT/CLOSED, non-public, database
 *     unavailable, or an id that exists only in the development fixture) →
 *     the page still RENDERS, because `JobDetailClient` fetches
 *     `/api/careers/jobs/{id}` and that route keeps its documented fixture
 *     fallback for development, but it is `noindex` and emits NO `JobPosting`.
 *
 * So the page keeps working in development and the search index only ever learns
 * about vacancies the database can prove. `/careers` itself remains a normal
 * public company page.
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

  const job = await getPublicJobById(jobId);
  if (!job) {
    // No authoritative vacancy: never advertise this URL. `noIndexMetadata`
    // deliberately emits no canonical, so a fixture-only page cannot claim one.
    return noIndexMetadata(p.careersJob.notFoundTitle);
  }

  return buildMetadata({
    locale,
    path:        `/careers/${job.id}`,
    title:       p.careersJob.titleTemplate.replace("{name}", job.title),
    description: job.description,
    keywords:    [...jobSkills(job), p.careersJob.keywordsSuffix].join(", "),
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

  const job = await getPublicJobById(jobId);

  // `datePosted` is REQUIRED by the JobPosting vocabulary and there is no honest
  // substitute for it, so an unusable timestamp suppresses the whole block
  // rather than being replaced by a placeholder date.
  const datePosted = job ? isoOrUndefined(job.createdAt) : undefined;

  return (
    <>
      {job && datePosted && (
        <JsonLd
          data={jobPostingSchema({
            id:           job.id,
            title:        job.title,
            description:  job.description,
            location:     job.location,
            // Salary is published only when BOTH bounds are present; the columns
            // are nullable and a half-known band is not a fact.
            currency:     job.salaryCurrency,
            salaryMin:    job.salaryMin,
            salaryMax:    job.salaryMax,
            // `AtsJob` has `locationType` (onsite/remote/hybrid), which is NOT an
            // employment type. There is no column for one, so none is claimed.
            datePosted,
            validThrough: isoOrUndefined(job.closingDate),
            skills:       jobSkills(job),
          })}
        />
      )}
      {/* The breadcrumb describes the URL the visitor is on and asserts nothing
          about employment, so it is emitted for a fixture-backed page too. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: bc.home,    item: `${BASE_URL}/${locale}` },
            { "@type": "ListItem", position: 2, name: bc.careers, item: `${BASE_URL}/${locale}/careers` },
            { "@type": "ListItem", position: 3, name: job?.title ?? pJob.careersJob.notFoundTitle, item: `${BASE_URL}/${locale}/careers/${jobId}` },
          ],
        }}
      />
      <JobDetailClient jobId={jobId} />
    </>
  );
}
