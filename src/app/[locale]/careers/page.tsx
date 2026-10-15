import { setRequestLocale } from "next-intl/server";
import { CareersBoardClient } from "@/components/careers/CareersBoardClient";
import { listPublicJobCards } from "@/lib/ats/public-jobs";

export default async function CareersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Server-render the real, eligible postings so the crawlable HTML carries the
  // job links the sitemap already advertises. `null` (store unreachable) keeps
  // the client-side fetch and its honest outage state — never an invented list.
  const initialJobs = await listPublicJobCards(locale);
  return <CareersBoardClient initialJobs={initialJobs} />;
}
