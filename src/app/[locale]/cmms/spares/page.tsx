import { getSpareParts }     from "@/lib/cmms/db";
import { SparePartsClient } from "@/components/cmms/SparePartsClient";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }  from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Spare Parts");
export const dynamic  = "force-dynamic";

export default async function SparesPage() {
  const t = await getTranslations("maintenanceOperations");
  const parts = await getSpareParts();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pages.sparesPage.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("pages.sparesPage.subtitle")}</p>
      </div>
      <SparePartsClient parts={parts} />
    </div>
  );
}
