import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }       from "@/components/PageShell";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { SectionHeader }   from "@/components/ui/SectionHeader";

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
      <div className="mx-auto max-w-7xl px-6 pt-10 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeader
            eyebrow={t("eyebrow")}
            title={t("title")}
            size="lg"
          />
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-line glass px-3 py-1.5 mt-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
            <span className="font-mono text-xs text-muted">{t("simulated")}</span>
          </div>
        </div>
      </div>
      <DashboardClient />
    </PageShell>
  );
}
