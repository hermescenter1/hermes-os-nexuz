import { collectionEndpoint } from "@/lib/erp/pagination";
import { getTranslations }      from "next-intl/server";
import { listApprovals }        from "@/lib/erp/operations";
import { ApprovalListQuerySchema } from "@/lib/erp/ops-schemas";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice }       from "@/components/erp/ErpScopeNotice";
import { ApprovalListClient }  from "@/components/erp/ApprovalListClient";
import { noIndexMetadata }     from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Approvals");
export const dynamic  = "force-dynamic";

export default async function ErpApprovalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const t          = await getTranslations("enterpriseOperations");
  const access     = await resolveErpPageScope();
  let body;
  if (!access.ok) {
    body = <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  } else {
    const parsed = ApprovalListQuerySchema.safeParse({ status });
    const query  = parsed.success ? parsed.data : ApprovalListQuerySchema.parse({});
    try {
      const page = await listApprovals(access.ctx, query);
      body = (<>
        <ApprovalListClient page={page} endpoint={collectionEndpoint("/api/erp/approvals", query)} />
      </>);
    } catch (err) {
      body = <ErpScopeNotice code={pageErrorCode(err)} />;
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("approvals.pageTitle")}</h1>
      {body}
    </div>
  );
}
