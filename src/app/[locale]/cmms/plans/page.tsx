import { getPlans }                from "@/lib/cmms/db";
import { MaintenancePlansClient } from "@/components/cmms/MaintenancePlansClient";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }        from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Maintenance Plans");
export const dynamic  = "force-dynamic";

export default async function PlansPage() {
  const t = await getTranslations("maintenanceOperations");
  const plans = await getPlans();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pages.plansList.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("pages.plansList.subtitle")}</p>
      </div>
      <MaintenancePlansClient plans={plans} />
    </div>
  );
}
