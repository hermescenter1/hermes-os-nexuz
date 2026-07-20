import { setRequestLocale, getTranslations } from "next-intl/server";
import { JobDetailClient }    from "@/components/careers/JobDetailClient";
import { JsonLd }             from "@/components/seo/JsonLd";
import { jobPostingSchema }   from "@/lib/seo/schemas";
import { buildMetadata }      from "@/lib/seo/metadata";
import { JOBS }               from "@/lib/ats/mock-data";
import { BASE_URL }           from "@/lib/seo/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const { locale, jobId } = await params;
  const job = JOBS.find((j) => j.id === jobId);
  // 89C: localized title template, keywords suffix and not-found title.
  const tMeta = await getTranslations({ locale, namespace: "meta" });
  const p = tMeta.raw("pages") as Record<string, Record<string, string>>;
  if (!job) return { title: p.careersJob.notFoundTitle };

  return buildMetadata({
    locale,
    path:        `/careers/${jobId}`,
    title:       p.careersJob.titleTemplate.replace("{name}", job.title),
    description: job.description,
    keywords:    [...job.requiredSkills, p.careersJob.keywordsSuffix].join(", "),
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

  const job = JOBS.find((j) => j.id === jobId);

  return (
    <>
      {job && (
        <JsonLd
          data={jobPostingSchema({
            id:           job.id,
            title:        job.title,
            description:  job.description,
            location:     job.location,
            currency:     job.currency,
            salaryMin:    job.salaryMin,
            salaryMax:    job.salaryMax,
            contractType: job.contractType,
            datePosted:   job.openedAt,
            skills:       job.requiredSkills,
          })}
        />
      )}
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
