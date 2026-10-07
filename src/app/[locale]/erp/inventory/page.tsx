import { collectionEndpoint } from "@/lib/erp/pagination";
import { getTranslations }      from "next-intl/server";
import { listInventory }        from "@/lib/erp/operations";
import { InventoryListQuerySchema } from "@/lib/erp/ops-schemas";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice }       from "@/components/erp/ErpScopeNotice";
import { InventoryListClient }  from "@/components/erp/InventoryListClient";
import { noIndexMetadata }      from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Inventory");
export const dynamic  = "force-dynamic";

export default async function ErpInventoryPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const t            = await getTranslations("enterpriseOperations");
  const access       = await resolveErpPageScope();
  let body;
  if (!access.ok) {
    body = <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  } else {
    const parsed = InventoryListQuerySchema.safeParse({ category });
    const query  = parsed.success ? parsed.data : InventoryListQuerySchema.parse({});
    try {
      const page = await listInventory(access.ctx, query);
      body = (<>
        <InventoryListClient page={page} endpoint={collectionEndpoint("/api/erp/inventory", query)} />
      </>);
    } catch (err) {
      body = <ErpScopeNotice code={pageErrorCode(err)} />;
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("inventory.pageTitle")}</h1>
      {body}
    </div>
  );
}
