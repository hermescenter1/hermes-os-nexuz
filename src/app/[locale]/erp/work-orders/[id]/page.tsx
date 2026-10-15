import { notFound }              from "next/navigation";
import { getWorkOrderById }      from "@/lib/erp/operations";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice }        from "@/components/erp/ErpScopeNotice";
import { WorkOrderDetailClient } from "@/components/erp/WorkOrderDetailClient";
import { noIndexMetadata }       from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Work Order");
export const dynamic  = "force-dynamic";

export default async function ErpWorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await resolveErpPageScope();
  if (!access.ok) return <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  try {
    const wo = await getWorkOrderById(access.ctx, id);
    return <WorkOrderDetailClient wo={wo} />;
  } catch (err) {
    if (pageErrorCode(err) === "NOT_FOUND") notFound();
    return <ErpScopeNotice code={pageErrorCode(err)} />;
  }
}
