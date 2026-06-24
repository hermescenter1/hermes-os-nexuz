import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }        from "@/components/PageShell";
import { ApiKeysDashboard } from "@/components/api/ApiKeysDashboard";
import { PageHeader }       from "@/components/ui/PageHeader";

export default async function ApiPlatformPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("apiPlatform");

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          level="page"
        />
        <ApiKeysDashboard />
      </div>
    </PageShell>
  );
}
