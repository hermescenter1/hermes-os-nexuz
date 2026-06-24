import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }       from "@/components/PageShell";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { PageHeader, PageStatusBadge } from "@/components/ui/PageHeader";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  return (
    <PageShell ambient={2}>
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          level="page"
          status={
            <PageStatusBadge label={t("simulated")} variant="simulated" />
          }
        />
      </div>
      <DashboardClient />
    </PageShell>
  );
}
