import { notFound }               from "next/navigation";
import { getInventoryById }       from "@/lib/erp/db";
import { InventoryDetailClient }  from "@/components/erp/InventoryDetailClient";
import { noIndexMetadata }        from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Inventory Item");
export const dynamic  = "force-dynamic";

export default async function ErpInventoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item   = await getInventoryById(id);
  if (!item) notFound();
  return <InventoryDetailClient item={item} />;
}
