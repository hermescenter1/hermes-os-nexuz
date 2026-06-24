export const metadata = { title: "My Applications · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale } from "next-intl/server";
import { CandidateApplicationsClient } from "@/components/candidate/CandidateApplicationsClient";

export default async function CandidateApplicationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CandidateApplicationsClient />;
}
