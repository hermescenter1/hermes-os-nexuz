import { notFound }              from "next/navigation";
import { getWorkOrderById }      from "@/lib/erp/db";
import { WorkOrderDetailClient } from "@/components/erp/WorkOrderDetailClient";
import { noIndexMetadata }       from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Work Order");
export const dynamic  = "force-dynamic";

export default async function ErpWorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wo     = await getWorkOrderById(id);
  if (!wo) notFound();
  return <WorkOrderDetailClient wo={wo} />;
}
