import { getTranslations }     from "next-intl/server";
import { getErpKpiReport }     from "@/lib/erp/db";
import { KpiDashboardClient }  from "@/components/erp/KpiDashboardClient";
import { noIndexMetadata }     from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Operational KPIs");
export const dynamic  = "force-dynamic";

export default async function ErpKpisPage() {
  const t      = await getTranslations("enterpriseOperations");
  const report = await getErpKpiReport();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("kpis.pageTitle")}</h1>
      <KpiDashboardClient report={report} />
    </div>
  );
}
