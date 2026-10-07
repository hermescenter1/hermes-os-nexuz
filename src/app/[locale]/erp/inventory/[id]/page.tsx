import { notFound }               from "next/navigation";
import { getInventoryById }       from "@/lib/erp/operations";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice }         from "@/components/erp/ErpScopeNotice";
import { InventoryDetailClient }  from "@/components/erp/InventoryDetailClient";
import { noIndexMetadata }        from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Inventory Item");
export const dynamic  = "force-dynamic";

export default async function ErpInventoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await resolveErpPageScope();
  if (!access.ok) return <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  try {
    const item = await getInventoryById(access.ctx, id);
    return <InventoryDetailClient item={item} />;
  } catch (err) {
    if (pageErrorCode(err) === "NOT_FOUND") notFound();
    return <ErpScopeNotice code={pageErrorCode(err)} />;
  }
}
