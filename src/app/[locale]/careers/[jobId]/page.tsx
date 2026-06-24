import { setRequestLocale } from "next-intl/server";
import { JobDetailClient }   from "@/components/careers/JobDetailClient";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const { locale, jobId } = await params;
  setRequestLocale(locale);
  return <JobDetailClient jobId={jobId} />;
}
