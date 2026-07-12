import { getDashboard }          from "@/lib/cmms/db";
import { CmmsDashboardClient }  from "@/components/cmms/CmmsDashboardClient";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }      from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("CMMS Dashboard");
export const dynamic  = "force-dynamic";

export default async function CmmsDashboardPage() {
  const t = await getTranslations("maintenanceOperations");
  const data = await getDashboard();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pages.dashboard.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("pages.dashboard.subtitle")}</p>
      </div>
      <CmmsDashboardClient data={data} />
    </div>
  );
}
