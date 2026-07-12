import { getCosts }              from "@/lib/cmms/db";
import { CostDashboardClient }  from "@/components/cmms/CostDashboardClient";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }      from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Maintenance Costs");
export const dynamic  = "force-dynamic";

export default async function CostsPage() {
  const t = await getTranslations("maintenanceOperations");
  const costs = await getCosts();
  const total = costs.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pages.costsPage.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("pages.costsPage.subtitle")}</p>
      </div>
      <CostDashboardClient costs={costs} total={total} />
    </div>
  );
}
