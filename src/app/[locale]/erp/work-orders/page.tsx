import { getWorkOrders }         from "@/lib/erp/db";
import { WorkOrderListClient }   from "@/components/erp/WorkOrderListClient";
import { noIndexMetadata }       from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Work Orders");
export const dynamic  = "force-dynamic";

export default async function ErpWorkOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; projectId?: string }> }) {
  const { status, projectId } = await searchParams;
  const orders                = await getWorkOrders(status, projectId);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Work Orders</h1>
      <WorkOrderListClient orders={orders} />
    </div>
  );
}
