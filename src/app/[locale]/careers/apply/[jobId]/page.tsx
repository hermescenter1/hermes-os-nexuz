import { setRequestLocale } from "next-intl/server";
import { ApplyFormClient }   from "@/components/careers/ApplyFormClient";

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const { locale, jobId } = await params;
  setRequestLocale(locale);
  return <ApplyFormClient jobId={jobId} />;
}
