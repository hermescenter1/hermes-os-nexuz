import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }          from "@/components/PageShell";
import { ApiKeysDashboard }   from "@/components/api/ApiKeysDashboard";

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
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <div className="mb-8">
          <p className="font-mono text-sm uppercase tracking-widest text-signal">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted text-sm">{t("subtitle")}</p>
        </div>
        <ApiKeysDashboard />
      </div>
    </PageShell>
  );
}
