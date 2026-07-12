import { getHistory }       from "@/lib/cmms/db";
import { HistoryClient }   from "@/components/cmms/HistoryClient";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Maintenance History");
export const dynamic  = "force-dynamic";

export default async function HistoryPage() {
  const t = await getTranslations("maintenanceOperations");
  const history = await getHistory(undefined, 100);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pages.historyPage.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("pages.historyPage.subtitle")}</p>
      </div>
      <HistoryClient history={history} />
    </div>
  );
}
