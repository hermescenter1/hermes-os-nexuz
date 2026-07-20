import { setRequestLocale, getTranslations } from "next-intl/server";
import { PrivacyCenterClient } from "@/components/compliance/PrivacyCenterClient";
import { PageShell }           from "@/components/PageShell";
import { buildMetadata }       from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path: "/privacy-center",
    title:       p.compliance.title,
    description: p.compliance.description,
    keywords:    p.compliance.keywords,
  });
}

export default async function PrivacyCenterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PageShell ambient={1}>
      <PrivacyCenterClient />
    </PageShell>
  );
}
