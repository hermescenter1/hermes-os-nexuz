import { collectionEndpoint } from "@/lib/erp/pagination";
import { getTranslations }       from "next-intl/server";
import { listWorkOrders }        from "@/lib/erp/operations";
import { WorkOrderListQuerySchema } from "@/lib/erp/ops-schemas";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice }        from "@/components/erp/ErpScopeNotice";
import { WorkOrderListClient }   from "@/components/erp/WorkOrderListClient";
import { noIndexMetadata }       from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Work Orders");
export const dynamic  = "force-dynamic";

export default async function ErpWorkOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; projectId?: string }> }) {
  const t                     = await getTranslations("enterpriseOperations");
  const { status, projectId } = await searchParams;
  const access                = await resolveErpPageScope();
  let body;
  if (!access.ok) {
    body = <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  } else {
    const parsed = WorkOrderListQuerySchema.safeParse({ status, projectId });
    const query  = parsed.success ? parsed.data : WorkOrderListQuerySchema.parse({});
    try {
      const page = await listWorkOrders(access.ctx, query);
      body = (<>
        <WorkOrderListClient page={page} endpoint={collectionEndpoint("/api/erp/work-orders", query)} />
      </>);
    } catch (err) {
      body = <ErpScopeNotice code={pageErrorCode(err)} />;
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("workOrders.pageTitle")}</h1>
      {body}
    </div>
  );
}
