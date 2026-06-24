import { setRequestLocale } from "next-intl/server";
import { CandidateDashboardClient } from "@/components/candidate/CandidateDashboardClient";

export default async function CandidateDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CandidateDashboardClient />;
}
