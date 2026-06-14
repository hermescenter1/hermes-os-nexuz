import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-sm uppercase tracking-widest text-signal">
              {t("eyebrow")}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold">{t("title")}</h1>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
            <span className="font-mono text-xs text-muted">{t("simulated")}</span>
          </span>
        </div>
      </div>
      <DashboardClient />
    </PageShell>
  );
}
