export const dynamic = "force-dynamic";
import { setRequestLocale } from "next-intl/server";
import { MemoryView }       from "@/components/engineering/MemoryView";

export default async function MemoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MemoryView />;
}
