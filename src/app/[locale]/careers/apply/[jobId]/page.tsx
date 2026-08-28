import { setRequestLocale, getTranslations } from "next-intl/server";
import { ApplyFormClient }                   from "@/components/careers/ApplyFormClient";

/**
 * PHASE 104-I3 — the application route.
 *
 * `robots: noindex` is retained: an application form is a transactional surface
 * and was never meant to be indexed. The title was previously a hard-coded
 * English literal exported as a static `metadata` object, which cannot vary by
 * locale; it is now generated per request from the catalogue.
 *
 * The route renders inside the Company-family chrome supplied by
 * src/app/[locale]/careers/layout.tsx, so no shell is applied here.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "careers.apply" });
  return {
    title:  t("titleGeneric"),
    robots: { index: false, follow: false },
  };
}

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const { locale, jobId } = await params;
  setRequestLocale(locale);
  return <ApplyFormClient jobId={jobId} />;
}
