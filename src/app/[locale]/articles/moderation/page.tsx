import { setRequestLocale, getTranslations } from "next-intl/server";
import { RequireCapability }             from "@/components/auth/RequireCapability";
import { getAllArticlesForModeration,
         getEditorialOperationsDashboard } from "@/lib/articles/db";
import { ModerationDashboardClient }     from "@/components/articles/ModerationDashboardClient";
import { EditorialOperationsDashboard }  from "@/components/articles/EditorialOperationsDashboard";
import { noIndexMetadata }               from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Journal Operations — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

export default async function ModerationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";
  const t    = await getTranslations({ locale, namespace: "journalEditorial" });

  const [articles, opsData] = await Promise.all([
    getAllArticlesForModeration(),
    getEditorialOperationsDashboard(),
  ]);

  return (
    <RequireCapability capability="admin">
      <div className="max-w-7xl mx-auto px-6">
        <EditorialOperationsDashboard data={opsData} isFa={isFa} locale={locale} />

        <div className="my-8 border-t border-line/20" />

        <div className="mb-4">
          <p className="eyebrow-mono text-signal text-[9px] mb-1 tracking-[0.2em]">
            {t("modContentMgmt")}
          </p>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-signal to-signal/20" />
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider">
              {t("modArticleMgmt")}
            </h2>
          </div>
        </div>
        <ModerationDashboardClient articles={articles} mode="moderation" />
      </div>
    </RequireCapability>
  );
}
