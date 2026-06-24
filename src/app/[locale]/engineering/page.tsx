export const dynamic = "force-dynamic";
export const metadata = { title: "Engineering Hub · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale } from "next-intl/server";
import { DashboardView }    from "@/components/engineering/DashboardView";

export default async function EngineeringRoot({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DashboardView />;
}
