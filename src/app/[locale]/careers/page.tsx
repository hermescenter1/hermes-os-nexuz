import { setRequestLocale } from "next-intl/server";
import { CareersBoardClient } from "@/components/careers/CareersBoardClient";

export default async function CareersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CareersBoardClient />;
}
