export const dynamic = "force-dynamic";
import { setRequestLocale } from "next-intl/server";
import { IntelligenceView } from "@/components/engineering/IntelligenceView";

export default async function IntelligencePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <IntelligenceView />;
}
