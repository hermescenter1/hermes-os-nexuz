import { getTranslations }      from "next-intl/server";
import { getInventory }         from "@/lib/erp/db";
import { InventoryListClient }  from "@/components/erp/InventoryListClient";
import { noIndexMetadata }      from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Inventory");
export const dynamic  = "force-dynamic";

export default async function ErpInventoryPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const items        = await getInventory(category);
  const t            = await getTranslations("enterpriseOperations");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("inventory.pageTitle")}</h1>
      <InventoryListClient items={items} />
    </div>
  );
}
