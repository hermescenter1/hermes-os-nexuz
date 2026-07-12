import { getTranslations }      from "next-intl/server";
import { getErpOverview }       from "@/lib/erp/db";
import { ErpDashboardClient }   from "@/components/erp/ErpDashboardClient";
import { noIndexMetadata }      from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("ERP Dashboard");
export const dynamic  = "force-dynamic";

export default async function ErpPage() {
  const t        = await getTranslations("enterpriseOperations");
  const overview = await getErpOverview();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("dashboard.pageTitle")}</h1>
      <ErpDashboardClient overview={overview} />
    </div>
  );
}
