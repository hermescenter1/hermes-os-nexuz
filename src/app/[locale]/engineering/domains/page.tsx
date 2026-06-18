export const dynamic = "force-dynamic";
import { setRequestLocale } from "next-intl/server";
import { DomainsView }      from "@/components/engineering/DomainsView";

export default async function DomainsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DomainsView />;
}
